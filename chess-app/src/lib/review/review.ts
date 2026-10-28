import { Chess, type Color, type Square } from 'chess.js';
import type { Engine } from '../engine/engine';
import type { OpeningBook } from '../chess/openings';
import { formatLine, materialBalance, moveToUci, nonPawnPieces, sanLine } from '../chess/utils';
import { estimateRating, gameAccuracy, moveAccuracy } from './accuracy';
import { classifyMove, evalScore } from './classify';
import { explainMove } from './explain';
import {
  CLASS_META,
  CLASS_ORDER,
  REVIEW_VERSION,
  type Classification,
  type GameReview,
  type Phase,
  type PlayerSummary,
  type PositionEval,
  type ReviewedMove,
} from './types';
import { clampedCp, winPercent } from './winprob';

export interface ReviewOptions {
  engines: Engine[];
  depth: number;
  multipv?: number;
  /** Hard cap per position in ms so pathological positions cannot stall a review. */
  maxTimeMs?: number;
  book?: OpeningBook | null;
  userColor?: Color;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onPosition?: (index: number, pos: PositionEval) => void;
  /** Evaluations already known (e.g. analysed in the background during the game), and where to keep new ones. */
  cache?: {
    get: (fen: string, minDepth: number, multipv: number) => Promise<PositionEval | null>;
    put: (pos: PositionEval, multipv: number) => Promise<void>;
  };
}

export interface GameInput {
  startFen: string;
  /** Moves in UCI notation from `startFen`. */
  moves: string[];
}

interface Ply {
  uci: string;
  san: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  legalMoves: number;
}

export function buildPlies(game: GameInput): { plies: Ply[]; fens: string[]; terminal: PositionEval['terminal'][] } {
  const chess = new Chess(game.startFen);
  const fens = [chess.fen()];
  const plies: Ply[] = [];
  const terminal: PositionEval['terminal'][] = [terminalOf(chess)];
  for (const uci of game.moves) {
    const fenBefore = chess.fen();
    const legalMoves = chess.moves().length;
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    plies.push({ uci: moveToUci(m), san: m.san, color: m.color, fenBefore, fenAfter: chess.fen(), legalMoves });
    fens.push(chess.fen());
    terminal.push(terminalOf(chess));
  }
  return { plies, fens, terminal };
}

function terminalOf(chess: Chess): PositionEval['terminal'] {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial() || chess.isThreefoldRepetition() || chess.isDrawByFiftyMoves()) return 'draw';
  return undefined;
}

/**
 * Analyses every position of a game in parallel across the given engines,
 * then re-checks positions whose evaluations contradict each other.
 */
export async function analysePositions(game: GameInput, opts: ReviewOptions): Promise<PositionEval[]> {
  const { fens, terminal } = buildPlies(game);
  const results: PositionEval[] = new Array(fens.length);
  const total = fens.length;
  const multipv = opts.multipv ?? 3;

  for (let i = 0; i < fens.length; i++) {
    if (terminal[i] === 'checkmate' || terminal[i] === 'stalemate') {
      results[i] = { fen: fens[i], lines: [], depth: 0, terminal: terminal[i] };
    }
  }
  // Positions already analysed deeply enough need no search at all.
  if (opts.cache)
    await Promise.all(
      fens.map(async (fen, i) => {
        if (results[i]) return;
        const hit = await opts.cache!.get(fen, opts.depth, multipv);
        if (hit) results[i] = finalDraw(hit, i);
      }),
    );
  let done = results.filter(Boolean).length;
  opts.onProgress?.(done, total);

  // A repetition / 50-move draw as the final position is a draw whatever the engine says.
  function finalDraw(pos: PositionEval, i: number): PositionEval {
    return terminal[i] === 'draw' && i === fens.length - 1
      ? { ...pos, lines: pos.lines.map((l) => ({ ...l, score: { type: 'cp', value: 0 } })) }
      : pos;
  }

  const analyseOne = async (engine: Engine, i: number, depth: number, movetime?: number): Promise<PositionEval> => {
    const handle = engine.search({
      fen: game.startFen,
      moves: game.moves.slice(0, i),
      limits: { depth, movetime },
      multipv,
    });
    const onAbort = () => handle.stop();
    opts.signal?.addEventListener('abort', onAbort);
    const res = await handle.promise;
    opts.signal?.removeEventListener('abort', onAbort);
    const fen = fens[i];
    const pos: PositionEval = {
      fen,
      depth: res.depth,
      lines: res.lines.filter((l) => l.pv.length).map((l) => ({ score: l.score, pv: l.pv, san: sanLine(fen, l.pv, 12), depth: l.depth })),
      terminal: terminal[i],
    };
    if (depth >= opts.depth) void opts.cache?.put(pos, multipv);
    return finalDraw(pos, i);
  };

  const runQueue = async (queue: number[], depth: number, movetime: number | undefined, onDone: (i: number, p: PositionEval) => void) => {
    let next = 0;
    await Promise.all(
      opts.engines.map(async (engine) => {
        while (!opts.signal?.aborted) {
          const k = next++;
          if (k >= queue.length) return;
          onDone(queue[k], await analyseOne(engine, queue[k], depth, movetime));
        }
      }),
    );
  };

  const firstPass = fens.map((_, i) => i).filter((i) => !results[i]);
  await runQueue(firstPass, opts.depth, opts.maxTimeMs, (i, pos) => {
    results[i] = pos;
    done++;
    opts.onPosition?.(i, pos);
    opts.onProgress?.(done, total);
  });
  if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');

  // Consistency pass: when the engine's own best move was played, the next
  // position should evaluate about the same. A big jump means one of the two
  // searches was unlucky (cut short, aspiration fail), so look again deeper.
  const suspicious = new Set<number>();
  for (let i = 0; i < game.moves.length; i++) {
    const a = results[i];
    const b = results[i + 1];
    if (!a?.lines[0] || !b || b.terminal || a.lines[0].pv[0] !== game.moves[i]) continue;
    if (Math.abs(winPercent(evalScore(a)) - winPercent(evalScore(b))) > 12) {
      suspicious.add(i);
      suspicious.add(i + 1);
    }
  }
  if (suspicious.size && suspicious.size <= Math.max(6, fens.length / 4)) {
    await runQueue([...suspicious], opts.depth + 2, opts.maxTimeMs ? opts.maxTimeMs * 3 : undefined, (i, pos) => {
      if (pos.depth >= (results[i]?.depth ?? 0)) results[i] = pos;
      opts.onPosition?.(i, results[i]);
    });
    if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');
  }
  return results;
}

function detectPhases(plies: Ply[], bookEnd: number): Phase[] {
  const phases: Phase[] = [];
  let phase: Phase = 'opening';
  for (let i = 0; i < plies.length; i++) {
    const chess = new Chess(plies[i].fenBefore);
    const pieces = nonPawnPieces(chess);
    const board = plies[i].fenBefore.split(' ')[0].split('/');
    const backRankSparse = (rank: string) => rank.replace(/\d/g, (d) => '.'.repeat(+d)).replace(/[.pP]/g, '').length < 4;
    if (phase === 'opening' && i >= bookEnd && (pieces <= 10 || backRankSparse(board[0]) || backRankSparse(board[7]) || i >= 30)) {
      phase = 'middlegame';
    }
    if (phase !== 'endgame' && pieces <= 6) phase = 'endgame';
    phases.push(phase);
  }
  return phases;
}

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries(CLASS_ORDER.map((c) => [c, 0])) as Record<Classification, number>;
}

/** Turns position evaluations into a full review (pure - no engine access). */
export function buildReview(
  game: GameInput,
  positions: PositionEval[],
  opts: { depth: number; book?: OpeningBook | null; userColor?: Color },
): GameReview {
  const { plies, fens } = buildPlies(game);
  const book = opts.book;

  let inBook = true;
  let bookEnd = 0;
  const bookFlags = plies.map((p, i) => {
    inBook = inBook && !!book?.has(p.fenAfter);
    if (inBook) bookEnd = i + 1;
    return inBook;
  });
  const phases = detectPhases(plies, bookEnd);
  const opening = book?.classify(fens.slice(0, Math.max(1, bookEnd + 1))) ?? undefined;

  const moves: ReviewedMove[] = [];
  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    const before = positions[i];
    const after = positions[i + 1];
    const prev = moves[i - 1];
    const recaptureSquare = prev && prev.san.includes('x') ? prev.uci.slice(2, 4) : undefined;
    const lostPiece = recaptureSquare ? new Chess(plies[i - 1].fenBefore).get(recaptureSquare as Square)?.type : undefined;
    // Behind compared with before our own previous move, i.e. the capture wasn't a reply to ours.
    const downMaterial = i >= 2 && materialBalance(new Chess(p.fenBefore), p.color) < materialBalance(new Chess(plies[i - 2].fenBefore), p.color);
    const cls = classifyMove({
      before,
      after,
      prevBefore: i > 0 ? positions[i - 1] : undefined,
      uci: p.uci,
      color: p.color,
      legalMoves: p.legalMoves,
      isBook: bookFlags[i],
      opponentLoss: prev?.epLoss,
      recaptureSquare,
    });
    const openingName = bookFlags[i] ? (book?.nameOf(p.fenAfter)?.name ?? book?.classify(fens.slice(0, i + 2))?.name) : undefined;
    const exp = explainMove({
      classification: cls.classification,
      color: p.color,
      san: p.san,
      uci: p.uci,
      before,
      after,
      epBefore: cls.epBefore,
      epAfter: cls.epAfter,
      epSecond: cls.epSecond,
      sacrifice: cls.sacrifice,
      sacrificePiece: cls.sacrificePiece,
      sacrificeSquare: cls.sacrificeSquare,
      isBook: bookFlags[i],
      opening: openingName,
      recaptureSquare,
      lostPiece,
      downMaterial,
      opponentClassification: prev?.classification,
    });
    const scoreBefore = evalScore(before);
    const scoreAfter = evalScore(after);
    const sign = p.color === 'w' ? 1 : -1;
    const cpLoss = Math.max(0, sign * (clampedCp(scoreBefore) - clampedCp(scoreAfter)));
    const winB = winPercent(scoreBefore);
    const winA = winPercent(scoreAfter);
    const acc = p.color === 'w' ? moveAccuracy(winB, winA) : moveAccuracy(100 - winB, 100 - winA);
    const bestLine = before.lines[0];
    moves.push({
      ply: i,
      color: p.color,
      san: p.san,
      uci: p.uci,
      fenBefore: p.fenBefore,
      fenAfter: p.fenAfter,
      classification: cls.classification,
      epBefore: cls.epBefore,
      epAfter: cls.epAfter,
      epLoss: cls.epLoss,
      winAfter: winA,
      accuracy: cls.classification === 'book' || cls.classification === 'forced' ? 100 : acc,
      cpLoss: cls.classification === 'book' || cls.epLoss === 0 ? 0 : Math.min(cpLoss, 1000),
      scoreAfter,
      bestMove: bestLine?.pv[0] ?? null,
      bestSan: bestLine?.san[0] ?? null,
      bestLine: bestLine?.san.slice(0, 10) ?? [],
      replyLine: after.lines[0]?.san.slice(0, 8) ?? [],
      phase: phases[i],
      opening: openingName,
      headline: exp.headline,
      comment: exp.comment,
      tags: exp.tags,
      squares: exp.squares,
    });
  }

  const wins = positions.map((p) => winPercent(evalScore(p)));
  const whiteFirst = game.startFen.split(' ')[1] !== 'b';
  const gameAcc = gameAccuracy(wins, whiteFirst);
  const summarise = (color: Color): PlayerSummary => {
    const mine = moves.filter((m) => m.color === color);
    const counts = emptyCounts();
    for (const m of mine) counts[m.classification]++;
    const acpl = mine.length ? mine.reduce((a, m) => a + m.cpLoss, 0) / mine.length : 0;
    const accuracy = (color === 'w' ? gameAcc.w : gameAcc.b) ?? 100;
    const phaseAcc = (ph: Phase) => {
      const list = mine.filter((m) => m.phase === ph);
      if (list.length < 2) return null;
      return list.reduce((a, m) => a + m.accuracy, 0) / list.length;
    };
    return {
      accuracy,
      acpl,
      estimatedRating: estimateRating(acpl, accuracy, mine.length),
      counts,
      phases: { opening: phaseAcc('opening'), middlegame: phaseAcc('middlegame'), endgame: phaseAcc('endgame') },
    };
  };
  const white = summarise('w');
  const black = summarise('b');

  const keyMoments = moves
    .filter((m) => ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.classification))
    .sort((a, b) => b.epLoss - a.epLoss)
    .slice(0, 8)
    .map((m) => m.ply)
    .sort((a, b) => a - b);

  const review: GameReview = {
    version: REVIEW_VERSION,
    depth: opts.depth,
    createdAt: Date.now(),
    startFen: game.startFen,
    positions,
    moves,
    white,
    black,
    opening: opening ?? undefined,
    keyMoments,
    summary: '',
  };
  review.summary = summariseGame(review, opts.userColor);
  return review;
}

export async function reviewGame(game: GameInput, opts: ReviewOptions): Promise<GameReview> {
  const positions = await analysePositions(game, opts);
  return buildReview(game, positions, opts);
}

const pct = (n: number) => `${Math.round(n)}%`;

function moveLabel(m: ReviewedMove) {
  const no = Math.floor(m.ply / 2) + 1;
  return `${no}${m.color === 'w' ? '.' : '...'} ${m.san}`;
}

/** A short written debrief of the whole game. */
export function summariseGame(r: GameReview, userColor?: Color): string {
  const out: string[] = [];
  const name = (c: Color) => (userColor ? (c === userColor ? 'You' : 'Your opponent') : c === 'w' ? 'White' : 'Black');
  const sides: Color[] = userColor ? [userColor, userColor === 'w' ? 'b' : 'w'] : ['w', 'b'];
  for (const c of sides) {
    const s = c === 'w' ? r.white : r.black;
    const ownMoves = r.moves.filter((m) => m.color === c && m.classification !== 'book').length;
    out.push(`${name(c)} played with ${pct(s.accuracy)} accuracy${ownMoves >= 8 ? ` (performance ≈ ${s.estimatedRating})` : ''}.`);
  }
  if (r.opening) {
    const lastBook = r.moves.filter((m) => m.classification === 'book').at(-1);
    out.push(`The opening was the ${r.opening.name}${lastBook ? `, with theory followed until ${moveLabel(lastBook)}` : ''}.`);
  }
  const focus = userColor ?? null;
  const pool = focus ? r.moves.filter((m) => m.color === focus) : r.moves;
  const worst = [...pool].sort((a, b) => b.epLoss - a.epLoss)[0];
  if (worst && worst.epLoss >= 0.1) {
    const who = focus ? 'your' : worst.color === 'w' ? 'White’s' : 'Black’s';
    out.push(`The turning point was ${who} ${moveLabel(worst)} (${CLASS_META[worst.classification].label.toLowerCase()}): ${worst.comment}`);
  }
  const s = focus ? (focus === 'w' ? r.white : r.black) : null;
  if (s && focus) {
    const tips: string[] = [];
    const mine = r.moves.filter((m) => m.color === focus);
    const hung = mine.filter((m) => m.tags.includes('hangs')).length;
    const allowedMate = mine.filter((m) => m.tags.includes('allowsMate')).length;
    const tacticalHits = mine.filter((m) => m.tags.some((t) => t.startsWith('allows:')) && ['mistake', 'blunder'].includes(m.classification)).length;
    const found = [
      s.counts.brilliant ? `${s.counts.brilliant} brilliant move${s.counts.brilliant > 1 ? 's' : ''}` : '',
      s.counts.great ? `${s.counts.great} great move${s.counts.great > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    if (found.length) out.push(`Nice: you found ${found.join(' and ')}.`);
    if (hung) tips.push(`you left material hanging ${hung} time${hung > 1 ? 's' : ''} - before each move, ask "what does this leave undefended?"`);
    if (allowedMate) tips.push('watch your king’s safety – you allowed a forced mate');
    if (tacticalHits) tips.push('your opponent had tactics (forks/pins) against you – check every forcing reply before you move');
    if (s.counts.miss)
      tips.push(
        `you missed ${s.counts.miss} chance${s.counts.miss > 1 ? 's' : ''} to punish mistakes – after every opponent move, scan for checks, captures and threats`,
      );
    const ph = Object.entries(s.phases).filter(([, v]) => v !== null) as [Phase, number][];
    if (ph.length >= 2) {
      ph.sort((a, b) => a[1] - b[1]);
      const [weak, weakAcc] = ph[0];
      const [strong] = ph[ph.length - 1];
      if (ph[ph.length - 1][1] - weakAcc > 8) tips.push(`your ${weak} (${pct(weakAcc)}) was weaker than your ${strong} - worth practising`);
    }
    if (!tips.length && s.accuracy >= 85) out.push('A clean, well-played game. Keep it up!');
  }
  return out.join(' ');
}

export function formatBestLine(m: ReviewedMove): string {
  return formatLine(m.fenBefore, m.bestLine);
}
