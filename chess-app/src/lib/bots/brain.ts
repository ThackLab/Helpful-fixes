// Bot move selection. Below ~1500 Elo Stockfish's own strength limiter does
// not go low enough and plays unnaturally, so we model how weaker people
// actually choose moves. Each bot has a limited "sight": a shallow search that
// always notices pieces left hanging and recaptures, but misses deeper
// tactics. Its judgement blends that sight with a deep evaluation (more of
// the deep one as the rating rises), plus a little noise. Now and then it
// plays a careless move without checking the reply at all, which is where
// hung pieces and greedy captures come from.
// From 1500 up we use Stockfish's calibrated UCI_Elo limiter.
import { Chess, type Move } from 'chess.js';
import type { Engine } from '../engine/engine';
import { scoreToCp, type Score } from '../engine/uci';
import type { OpeningBook } from '../chess/openings';
import { PIECE_VALUE, moveToUci } from '../chess/utils';
import type { BotProfile } from './bots';

export interface StrengthParams {
  mode: 'human' | 'limited' | 'full';
  /** Depth of the deep search (what is really going on). */
  depth: number;
  multipv: number;
  /** Depth of the bot's own sight (what it notices); a fraction means the deeper sight is used that share of the time. */
  sightDepth: number;
  /** Weight of the deep evaluation against its own sight (0..1). */
  insight: number;
  /** Moves the bot judges within this many centipawns of its favourite all look playable to it. */
  window: number;
  /** Judgement noise in centipawns when choosing among them. */
  noise: number;
  /** Chance per move of a careless move that ignores the opponent's replies. */
  carelessRate: number;
  movetime: number;
  /** How many plies the bot may follow its opening book. */
  bookPlies: number;
}

export const STOCKFISH_MIN_ELO = 1500;
export const STOCKFISH_MAX_ELO = 3190;

/**
 * Human-model settings at anchor ratings, interpolated in between:
 * [elo, careless rate, window, noise, insight]. Tuned with
 * src/test/botCalibrate.test.ts and src/test/botLadder.test.ts.
 */
const ANCHORS: [number, number, number, number, number][] = [
  [100, 0.65, 330, 150, 0],
  [400, 0.45, 270, 125, 0.05],
  [700, 0.25, 210, 100, 0.18],
  [850, 0.17, 186, 85, 0.25],
  [1150, 0.12, 165, 75, 0.34],
  [1450, 0.08, 150, 68, 0.45],
];

function anchored(elo: number, field: 1 | 2 | 3 | 4): number {
  const e = Math.max(ANCHORS[0][0], Math.min(ANCHORS[ANCHORS.length - 1][0], elo));
  let i = 0;
  while (i < ANCHORS.length - 2 && e > ANCHORS[i + 1][0]) i++;
  const [a, b] = [ANCHORS[i], ANCHORS[i + 1]];
  const t = (e - a[0]) / (b[0] - a[0]);
  return a[field] + (b[field] - a[field]) * t;
}

export function strengthFor(elo: number): StrengthParams {
  const bookPlies = Math.round(Math.max(2, Math.min(24, (elo - 100) / 110)));
  const none = { sightDepth: 0, insight: 1, window: 0, noise: 0, carelessRate: 0 };
  if (elo >= 3150) return { mode: 'full', depth: 0, multipv: 1, ...none, movetime: 1500, bookPlies: 16 };
  if (elo >= STOCKFISH_MIN_ELO) {
    const t = (elo - STOCKFISH_MIN_ELO) / (STOCKFISH_MAX_ELO - STOCKFISH_MIN_ELO);
    return { mode: 'limited', depth: 0, multipv: 1, ...none, movetime: Math.round(300 + 900 * t), bookPlies };
  }
  const e = Math.max(100, elo);
  return {
    mode: 'human',
    depth: e < 700 ? 8 : 10,
    multipv: e < 700 ? 12 : 16,
    sightDepth: e < 600 ? 1 : 2 + Math.max(0, Math.min(1, (e - 950) / 450)),
    insight: anchored(e, 4),
    window: anchored(e, 2),
    noise: anchored(e, 3),
    carelessRate: anchored(e, 1),
    movetime: 0,
    bookPlies,
  };
}

export interface BotMoveContext {
  startFen: string;
  /** Moves played so far (UCI). */
  moves: string[];
  bot: BotProfile;
  book?: OpeningBook | null;
  rng?: () => number;
}

export interface BotMove {
  uci: string;
  san: string;
  source: 'book' | 'engine' | 'careless';
  /** Engine evaluation from White's perspective (when known). */
  score?: Score;
}

/** Standard normal sample (Box-Muller). */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function pickWeighted<T>(items: { item: T; w: number }[], rng: () => number): T {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.item;
  }
  return items[items.length - 1].item;
}

/** How "natural" a careless move looks to a weak human: captures, checks and forward moves. */
function naturalness(m: Move, chess: Chess): number {
  let w = 1;
  if (m.captured) w *= 3;
  if (m.san.includes('+')) w *= 2;
  if (m.isKingsideCastle() || m.isQueensideCastle()) w *= 2.5;
  if (m.piece === 'k') w *= 0.3;
  if (m.piece === 'q' && chess.moveNumber() < 8) w *= 1.8;
  const forward = m.color === 'w' ? +m.to[1] - +m.from[1] : +m.from[1] - +m.to[1];
  if (forward > 0) w *= 1.3;
  if (['d4', 'e4', 'd5', 'e5', 'c4', 'f4', 'c5', 'f5'].includes(m.to)) w *= 1.4;
  return w;
}

function bookMove(ctx: BotMoveContext, chess: Chess, params: StrengthParams, rng: () => number): string | null {
  const ply = ctx.moves.length;
  if (ply >= params.bookPlies) return null;
  const legal = new Set(chess.moves({ verbose: true }).map(moveToUci));
  const rep = ctx.bot.repertoire;
  if (rep) {
    if (ply === 0 && rep.white?.length) return rep.white[Math.floor(rng() * rep.white.length)];
    if (ply === 1 && rep.black) {
      const options = rep.black[ctx.moves[0]];
      const ok = options?.filter((u) => legal.has(u));
      if (ok?.length) return ok[Math.floor(rng() * ok.length)];
    }
  }
  if (!ctx.book) return null;
  const options = ctx.book.weightedMovesFrom(chess.fen()).filter((o) => legal.has(o.uci));
  if (!options.length) return null;
  // Flatten popularity slightly so bots don't always play the same mainline.
  return pickWeighted(
    options.map((o) => ({ item: o.uci, w: Math.pow(o.weight, 0.85) })),
    rng,
  );
}

export async function chooseBotMove(engine: Engine, ctx: BotMoveContext): Promise<BotMove> {
  const rng = ctx.rng ?? Math.random;
  const chess = new Chess(ctx.startFen);
  for (const u of ctx.moves) chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const legal = chess.moves({ verbose: true });
  if (!legal.length) throw new Error('No legal moves');
  const sanOf = (uci: string) => legal.find((m) => moveToUci(m) === uci)?.san ?? uci;
  const params = strengthFor(ctx.bot.elo);

  if (legal.length === 1) return { uci: moveToUci(legal[0]), san: legal[0].san, source: 'engine' };

  const fromBook = bookMove(ctx, chess, params, rng);
  if (fromBook && legal.some((m) => moveToUci(m) === fromBook)) return { uci: fromBook, san: sanOf(fromBook), source: 'book' };

  const base = { fen: ctx.startFen, moves: ctx.moves };
  if (params.mode !== 'human') {
    const res = await engine.analyse({
      ...base,
      limits: { movetime: params.movetime },
      multipv: 1,
      options: params.mode === 'full' ? { UCI_LimitStrength: false } : { UCI_LimitStrength: true, UCI_Elo: Math.min(STOCKFISH_MAX_ELO, ctx.bot.elo) },
    });
    const uci = res.bestmove ?? moveToUci(legal[0]);
    return { uci, san: sanOf(uci), source: 'engine', score: res.lines[0]?.score };
  }

  // Human-like selection. Simplified positions get a deeper look so that won
  // endgames are eventually converted instead of shuffled forever.
  const pieces = chess
    .board()
    .flat()
    .filter((p) => p && p.type !== 'p' && p.type !== 'k').length;
  const sign = chess.turn() === 'w' ? 1 : -1;
  const cpOf = (sc: Score) => sign * scoreToCp(sc);
  const deepRes = await engine.analyse({
    ...base,
    limits: { depth: params.depth + (pieces <= 4 ? 4 : pieces <= 8 ? 2 : 0) },
    multipv: Math.min(params.multipv, legal.length),
    options: { UCI_LimitStrength: false },
  });
  const deepLines = deepRes.lines.filter((l) => l.pv.length);
  if (!deepLines.length) {
    const uci = deepRes.bestmove ?? moveToUci(legal[0]);
    return { uci, san: sanOf(uci), source: 'engine' };
  }
  const deep = new Map(deepLines.map((l) => [l.pv[0], cpOf(l.score)]));
  const scoreOf = (uci: string) => deepLines.find((l) => l.pv[0] === uci)?.score;
  const bestDeep = cpOf(deepLines[0].score);
  const floor = Math.min(...deep.values()) - 50;
  const winning = bestDeep > 400;
  const elo = ctx.bot.elo;

  // When clearly winning, even weak players try to finish the game: mostly
  // the engine's move (so mates are found and games end), otherwise as usual.
  if (winning && rng() < 0.25 + 0.65 * Math.min(1, elo / 1500)) {
    const uci = deepLines[0].pv[0];
    return { uci, san: sanOf(uci), source: 'engine', score: deepLines[0].score };
  }

  if (rng() < params.carelessRate * (winning ? 0.3 : 1)) {
    // A careless move: it grabs what is there or looks natural, without
    // checking the reply. Stronger bots' careless moves cost less.
    // Above 600 only moves with a known cost qualify, so the cap really holds.
    const cap = elo < 600 ? Infinity : elo < 1000 ? 600 : 350;
    const pool = legal.filter((m) => {
      const d = deep.get(moveToUci(m));
      return cap === Infinity || (d !== undefined && bestDeep - d <= cap);
    });
    if (pool.length) {
      let pick = pool[0];
      let top = -Infinity;
      for (const m of pool) {
        const v =
          (m.captured ? 100 * PIECE_VALUE[m.captured] : 0) + (m.promotion ? 800 : 0) + 40 * Math.log(naturalness(m, chess)) + 60 * gaussian(rng);
        if (v > top) {
          top = v;
          pick = m;
        }
      }
      const uci = moveToUci(pick);
      return { uci, san: pick.san, source: 'careless', score: scoreOf(uci) };
    }
  }

  // What the bot actually sees: a shallow search over every move.
  const sightRes = await engine.analyse({
    ...base,
    limits: { depth: Math.floor(params.sightDepth) + (rng() < params.sightDepth % 1 ? 1 : 0) },
    multipv: legal.length,
    options: { UCI_LimitStrength: false },
  });
  const seen = new Map(sightRes.lines.filter((l) => l.pv.length).map((l) => [l.pv[0], cpOf(l.score)]));
  const insight = winning ? Math.max(params.insight, 0.8) : params.insight;
  const window = winning ? params.window / 2 : params.window;
  const clamp = (cp: number) => Math.max(-1500, Math.min(1500, cp));
  const judged = legal.map((m) => {
    const uci = moveToUci(m);
    const s = seen.get(uci) ?? floor;
    const d = deep.get(uci) ?? Math.min(floor, s);
    return { uci, v: insight * clamp(d) + (1 - insight) * clamp(s) };
  });
  // Moves that look clearly worse are never chosen on purpose; among the ones
  // that look fine, the choice is a matter of taste (noise).
  const favourite = Math.max(...judged.map((j) => j.v));
  let choice = judged[0].uci;
  let top = -Infinity;
  for (const j of judged) {
    if (j.v < favourite - window) continue;
    const v = j.v + params.noise * gaussian(rng);
    if (v > top) {
      top = v;
      choice = j.uci;
    }
  }
  return { uci: choice, san: sanOf(choice), source: 'engine', score: scoreOf(choice) };
}

/** Whether the bot accepts a draw offer, given the eval from the bot's point of view (cp). */
export function botAcceptsDraw(botCp: number, ply: number, elo: number): boolean {
  if (botCp <= -150) return true;
  if (ply < 40) return false;
  return Math.abs(botCp) <= (elo < 1500 ? 80 : 30);
}

/** Simulated thinking time so bots don't move instantly (ms). */
export function thinkTime(elo: number, ply: number, rng: () => number = Math.random, clockMs?: number): number {
  const opening = ply < 10;
  let base = opening ? 350 + rng() * 500 : 600 + rng() * 1600;
  if (elo >= 2500) base *= 0.8;
  if (clockMs !== undefined) {
    const budget = clockMs / 35;
    base = Math.min(base, budget);
  }
  return Math.max(150, base);
}
