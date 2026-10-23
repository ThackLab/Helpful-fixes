import { Engine, workerTransport } from './engine';

const base = import.meta.env.BASE_URL;

export const canUseThreads = () => typeof self !== 'undefined' && self.crossOriginIsolated === true && (navigator.hardwareConcurrency ?? 1) > 1;

export function engineUrl(threaded: boolean) {
  return `${base}engine/stockfish-18-lite${threaded ? '' : '-single'}.js`;
}

export function hardwareThreads() {
  return Math.max(1, navigator.hardwareConcurrency ?? 2);
}

function createEngine(opts: { threaded?: boolean; hash?: number; threads?: number } = {}) {
  const threaded = !!opts.threaded && canUseThreads();
  const initial: Record<string, string | number | boolean> = { Hash: opts.hash ?? 32 };
  if (threaded) initial.Threads = Math.max(1, opts.threads ?? hardwareThreads() - 1);
  return new Engine(workerTransport(engineUrl(threaded)), initial);
}

let analysisEngine: Engine | null = null;
let analysisConfig = '';
let botEngine: Engine | null = null;

export interface AnalysisEngineConfig {
  threads: number;
  hash: number;
}

/** Long-lived engine for the interactive analysis board and hints. */
export function getAnalysisEngine(cfg: AnalysisEngineConfig = { threads: hardwareThreads() - 1, hash: 64 }): Engine {
  const key = `${cfg.threads}/${cfg.hash}`;
  if (analysisEngine && analysisConfig !== key) {
    analysisEngine.terminate();
    analysisEngine = null;
  }
  if (!analysisEngine) {
    analysisEngine = createEngine({ threaded: cfg.threads > 1, threads: cfg.threads, hash: cfg.hash });
    analysisConfig = key;
  }
  return analysisEngine;
}

/** Separate engine for bot moves so analysis settings never leak into play. */
export function getBotEngine(): Engine {
  if (!botEngine) botEngine = createEngine({ hash: 32 });
  return botEngine;
}

/** A pool of single-threaded engines for batch work such as full-game review. */
export class EnginePool {
  readonly engines: Engine[];
  constructor(size: number, hash = 32) {
    this.engines = Array.from({ length: Math.max(1, size) }, () => createEngine({ hash }));
  }
  get size() {
    return this.engines.length;
  }
  async ready() {
    await Promise.all(this.engines.map((e) => e.ready));
  }
  terminate() {
    for (const e of this.engines) e.terminate();
  }
}

export function defaultPoolSize() {
  const n = hardwareThreads();
  return Math.min(6, Math.max(1, n - 1));
}
