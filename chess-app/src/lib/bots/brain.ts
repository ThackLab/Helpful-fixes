// Bot move selection. Below ~1500 Elo Stockfish's own strength limiter does
// not go low enough and plays unnaturally, so we "humanise" it: score many
// candidate moves with a shallow search, then pick with a temperature that
// grows as the rating drops, plus occasional natural-looking blunders.
// From 1500 up we use Stockfish's calibrated UCI_Elo limiter.
import { Chess, type Move } from 'chess.js';
import type { Engine } from '../engine/engine';
import { scoreToCp, type Score } from '../engine/uci';
import type { OpeningBook } from '../chess/openings';
import { moveToUci } from '../chess/utils';
import type { BotProfile } from './bots';

export interface StrengthParams {
  mode: 'human' | 'limited' | 'full';
  depth: number;
  multipv: number;
  /** Softmax temperature in centipawns (human mode). */
  temperature: number;
  /** Chance of a "careless" move ignoring the evaluation (human mode). */
  blunderRate: number;
  movetime: number;
  /** How many plies the bot may follow its opening book. */
  bookPlies: number;
}

export const STOCKFISH_MIN_ELO = 1500;
export const STOCKFISH_MAX_ELO = 3190;

export function strengthFor(elo: number): StrengthParams {
  const bookPlies = Math.round(Math.max(2, Math.min(24, (elo - 100) / 110)));
  if (elo >= 3150) return { mode: 'full', depth: 0, multipv: 1, temperature: 0, blunderRate: 0, movetime: 1500, bookPlies: 16 };
  if (elo >= STOCKFISH_MIN_ELO) {
    const t = (elo - STOCKFISH_MIN_ELO) / (STOCKFISH_MAX_ELO - STOCKFISH_MIN_ELO);
    return { mode: 'limited', depth: 0, multipv: 1, temperature: 0, blunderRate: 0, movetime: Math.round(300 + 900 * t), bookPlies };
  }
  const e = Math.max(100, elo);
  return {
    mode: 'human',
    depth: e < 700 ? 6 : e < 1100 ? 8 : 10,
    multipv: e < 700 ? 40 : e < 1100 ? 30 : 20,
    temperature: 400 * Math.exp(-(e - 250) / 580),
    blunderRate: Math.min(0.4, 0.3 * Math.exp(-(e - 250) / 520)),
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
  const res = await engine.analyse({
    ...base,
    limits: { depth: params.depth + (pieces <= 4 ? 4 : pieces <= 8 ? 2 : 0) },
    multipv: Math.min(params.multipv, legal.length),
    options: { UCI_LimitStrength: false },
  });
  const white = chess.turn() === 'w';
  const scored = res.lines.filter((l) => l.pv.length).map((l) => ({ uci: l.pv[0], cp: (white ? 1 : -1) * scoreToCp(l.score), score: l.score }));
  if (!scored.length) {
    const uci = res.bestmove ?? moveToUci(legal[0]);
    return { uci, san: sanOf(uci), source: 'engine' };
  }

  const best = scored[0].cp;
  // Clearly winning: weak players still blunder, but they do try to finish the game.
  const winning = best > 500;
  if (rng() < params.blunderRate * (winning ? 0.4 : 1)) {
    // A careless move: something natural-looking, not necessarily the worst.
    // Stronger bots' careless moves are "only" mistakes, not random hangs.
    const maxLoss = ctx.bot.elo < 600 ? Infinity : ctx.bot.elo < 1000 ? 700 : 400;
    const bestCp = best;
    const evalOf = new Map(scored.map((s) => [s.uci, s.cp]));
    const pool = legal.map((m) => ({ m, loss: bestCp - (evalOf.get(moveToUci(m)) ?? bestCp - 300) })).filter((x) => x.loss <= maxLoss);
    if (pool.length) {
      const m = pickWeighted(
        pool.map((x) => ({ item: x.m, w: naturalness(x.m, chess) })),
        rng,
      );
      const uci = moveToUci(m);
      return { uci, san: m.san, source: 'careless', score: scored.find((s) => s.uci === uci)?.score };
    }
  }

  const LOSS_CAP = 1200; // even beginners usually spot that a move loses the queen *sometimes*
  // When far ahead, play purposefully so won games get converted instead of shuffled.
  const temperature = winning ? Math.min(params.temperature, 20 + params.temperature * 0.1) : params.temperature;
  const choice = pickWeighted(
    scored.map((s) => ({ item: s, w: Math.exp(-Math.min(LOSS_CAP, best - s.cp) / temperature) })),
    rng,
  );
  return { uci: choice.uci, san: sanOf(choice.uci), source: 'engine', score: choice.score };
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
