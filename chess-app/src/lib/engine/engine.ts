import { parseInfo, type PvLine, type SearchLimits, type SearchResult } from './uci';

/** Minimal message channel to a UCI engine (a Web Worker in the browser, a child process in tests). */
export interface Transport {
  post(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

export interface SearchRequest {
  fen: string;
  /** UCI moves to apply on top of `fen`. */
  moves?: string[];
  limits: SearchLimits;
  multipv?: number;
  /** Engine options that must hold for this search (applied only when changed). */
  options?: Record<string, string | number | boolean>;
  onInfo?: (lines: PvLine[], depth: number) => void;
}

export interface SearchHandle {
  promise: Promise<SearchResult>;
  stop(): void;
}

/**
 * A transport to an engine worker. With a `fallback`, a worker that fails before it has said
 * anything (a multi-threaded build that can't get its shared memory on a low-memory device) is
 * replaced by the fallback build, and the commands sent so far are sent again; `adapt` can rewrite
 * or drop commands meant for the first build.
 */
export function workerTransport(url: string, fallback?: { url: string; adapt?: (cmd: string) => string | null }): Transport {
  let listener: (line: string) => void = () => {};
  let heard = false;
  let onFallback = false;
  const sent: string[] = [];
  const toWorker = (cmd: string) => {
    const c = onFallback && fallback?.adapt ? fallback.adapt(cmd) : cmd;
    if (c !== null) worker.postMessage(c);
  };
  const start = (u: string) => {
    const w = new Worker(u);
    w.onmessage = (e: MessageEvent) => {
      const data = typeof e.data === 'string' ? e.data : String(e.data);
      for (const line of data.split('\n')) {
        if (!line) continue;
        // Only real engine output counts: a failing threaded build can post its own messages first.
        if (!heard && /^(id |option |uciok|readyok|info |bestmove|Stockfish)/.test(line)) heard = true;
        listener(line);
      }
    };
    w.onerror = (e) => {
      console.error('[engine] worker error', e.message);
      if (heard || onFallback || !fallback) return;
      onFallback = true;
      w.terminate();
      worker = start(fallback.url);
      for (const cmd of sent) toWorker(cmd);
    };
    return w;
  };
  let worker = start(url);
  return {
    post: (cmd) => {
      if (!heard) sent.push(cmd);
      toWorker(cmd);
    },
    onLine: (cb) => (listener = cb),
    terminate: () => worker.terminate(),
  };
}

function turnOf(fen: string, moves: string[] = []): boolean {
  const white = fen.split(' ')[1] !== 'b';
  return moves.length % 2 === 0 ? white : !white;
}

/**
 * Promise-based UCI engine wrapper. Searches are serialised: starting a new
 * search while one is running queues it, and `stop()` on a handle aborts the
 * search (or drops it if it has not started yet).
 */
export class Engine {
  name = 'Stockfish';
  private listeners = new Set<(line: string) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private options = new Map<string, string>();
  private readyPromise: Promise<void>;
  private dead = false;

  constructor(
    private transport: Transport,
    initialOptions: Record<string, string | number | boolean> = {},
  ) {
    transport.onLine((line) => {
      for (const l of [...this.listeners]) l(line);
    });
    this.readyPromise = this.boot(initialOptions);
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  private async boot(initial: Record<string, string | number | boolean>) {
    const idLine = this.waitFor((l) => l.startsWith('id name'), 60000).catch(() => '');
    this.transport.post('uci');
    await this.waitFor((l) => l === 'uciok', 60000);
    const id = await Promise.race([idLine, Promise.resolve('')]);
    if (id) this.name = id.replace('id name ', '');
    for (const [k, v] of Object.entries(initial)) this.writeOption(k, v);
    await this.isReady();
  }

  private writeOption(name: string, value: string | number | boolean) {
    const v = String(value);
    if (this.options.get(name) === v) return false;
    this.options.set(name, v);
    this.transport.post(`setoption name ${name} value ${v}`);
    return true;
  }

  private waitFor(pred: (line: string) => boolean, timeoutMs = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fn = (line: string) => {
        if (!pred(line)) return;
        this.listeners.delete(fn);
        if (timer) clearTimeout(timer);
        resolve(line);
      };
      this.listeners.add(fn);
      if (timeoutMs) {
        timer = setTimeout(() => {
          this.listeners.delete(fn);
          reject(new Error('engine timeout'));
        }, timeoutMs);
      }
    });
  }

  private async isReady() {
    const p = this.waitFor((l) => l === 'readyok');
    this.transport.post('isready');
    await p;
  }

  /** Runs `fn` after every previously queued operation finished. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.readyPromise;
      this.transport.post('ucinewgame');
      await this.isReady();
    });
  }

  search(req: SearchRequest): SearchHandle {
    let cancelled = false;
    let running = false;
    const stop = () => {
      cancelled = true;
      if (running) this.transport.post('stop');
    };
    const promise = this.enqueue<SearchResult>(async () => {
      await this.readyPromise;
      const empty: SearchResult = { bestmove: null, lines: [], depth: 0, fen: req.fen };
      if (cancelled || this.dead) return empty;
      let changed = false;
      for (const [k, v] of Object.entries(req.options ?? {})) changed = this.writeOption(k, v) || changed;
      changed = this.writeOption('MultiPV', req.multipv ?? 1) || changed;
      if (changed) await this.isReady();
      if (cancelled) return empty;

      const whiteToMove = turnOf(req.fen, req.moves);
      const lines = new Map<number, PvLine>();
      let depth = 0;
      const pos = `position fen ${req.fen}${req.moves?.length ? ` moves ${req.moves.join(' ')}` : ''}`;
      const l = req.limits;
      const go = ['go'];
      if (l.infinite) go.push('infinite');
      else {
        if (l.depth) go.push('depth', String(l.depth));
        if (l.movetime) go.push('movetime', String(Math.round(l.movetime)));
        if (l.nodes) go.push('nodes', String(Math.round(l.nodes)));
        if (go.length === 1) go.push('depth', '18');
      }
      if (l.searchmoves?.length) go.push('searchmoves', ...l.searchmoves);

      return new Promise<SearchResult>((resolve) => {
        const fn = (line: string) => {
          if (line.startsWith('info ')) {
            if (!line.includes(' pv ') && !line.includes(' score mate 0')) return;
            const info = parseInfo(line, whiteToMove);
            if (!info) return;
            // Bound (fail-high/low) lines are provisional; keep the previous exact line when we have one.
            const prev = lines.get(info.multipv);
            if (info.bound && prev && prev.depth >= info.depth - 1 && !prev.bound) return;
            lines.set(info.multipv, info);
            if (info.multipv === 1) depth = info.depth;
            req.onInfo?.(sortLines(lines), depth);
          } else if (line.startsWith('bestmove')) {
            this.listeners.delete(fn);
            running = false;
            const parts = line.split(' ');
            const best = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
            resolve({
              bestmove: best,
              ponder: parts[3],
              lines: sortLines(lines),
              depth,
              fen: req.fen,
            });
          }
        };
        this.listeners.add(fn);
        this.transport.post(pos);
        this.transport.post(go.join(' '));
        running = true;
        if (cancelled) this.transport.post('stop');
      });
    });
    return { promise, stop };
  }

  /** Convenience wrapper: analyse and wait for the result. */
  analyse(req: SearchRequest): Promise<SearchResult> {
    return this.search(req).promise;
  }

  terminate() {
    this.dead = true;
    try {
      this.transport.post('quit');
    } catch {
      /* ignore */
    }
    this.transport.terminate();
  }
}

function sortLines(lines: Map<number, PvLine>): PvLine[] {
  return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
}
