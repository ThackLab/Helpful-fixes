// The coach during a game: before the bot answers, a quick search of the
// position before and after your move tells whether it threw something away,
// and the warning says what, in the review's words. It also notices when the
// bot slips, so you can look for the punishment.
import { Chess, type Color } from 'chess.js';
import type { Engine } from '../engine/engine';
import { createSingleEngine } from '../engine/manager';
import { playUci, sanLine } from '../chess/utils';
import { warningText } from '../review/explain';
import { expectedFor } from '../review/winprob';
import type { PositionEval } from '../review/types';

const DEPTH = 11;
/** Expected points a move may lose before the coach steps in (a clear mistake). */
const WARN_AT = 0.15;

let engine: Engine | null = null;
const seen = new Map<string, PositionEval>();

function fenOf(startFen: string, moves: string[]): string {
  const c = new Chess(startFen);
  for (const u of moves) playUci(c, u);
  return c.fen();
}

async function evaluate(startFen: string, moves: string[]): Promise<PositionEval | null> {
  const fen = fenOf(startFen, moves);
  const hit = seen.get(fen);
  if (hit) return hit;
  if (new Chess(fen).isGameOver()) return null;
  engine ??= createSingleEngine(16);
  const r = await engine.analyse({ fen: startFen, moves, limits: { depth: DEPTH, movetime: 4000 }, multipv: 1 });
  const pos: PositionEval = {
    fen,
    depth: r.depth,
    lines: r.lines.filter((l) => l.pv.length).map((l) => ({ score: l.score, pv: l.pv, san: sanLine(fen, l.pv, 12), depth: l.depth })),
  };
  if (!pos.lines.length) return null;
  if (seen.size > 200) seen.clear();
  seen.set(fen, pos);
  return pos;
}

export interface Verdict {
  warn: boolean;
  /** What the move allows, when it is a mistake. */
  text?: string;
  /** Your expected score after the move, 0..1. */
  ep: number;
}

/** Judges the move just played by `color` (the last of `moves`). */
export async function checkMove(startFen: string, moves: string[], color: Color): Promise<Verdict | null> {
  const before = await evaluate(startFen, moves.slice(0, -1));
  const uci = moves[moves.length - 1];
  const afterFen = fenOf(startFen, moves);
  const after = new Chess(afterFen);
  if (after.isCheckmate()) return { warn: false, ep: 1 };
  const afterEval = await evaluate(startFen, moves);
  if (!before || !afterEval) return null;
  const epBest = expectedFor(before.lines[0].score, color);
  const ep = expectedFor(afterEval.lines[0].score, color);
  // Nothing to save in a position that was already lost.
  if (epBest - ep < WARN_AT || epBest < 0.2) return { warn: false, ep };
  const c = new Chess(before.fen);
  const san = playUci(c, uci)?.san ?? uci;
  const text = warningText(before, afterEval, color, uci, san) || (ep < 0.3 ? 'This gives away the game.' : 'This throws away your advantage.');
  return { warn: true, text, ep };
}

/** After the opponent's move: how much better your position got, 0..1 (a big jump means they slipped). */
export async function opponentSlip(startFen: string, moves: string[], color: Color, epBefore: number): Promise<number> {
  const pos = await evaluate(startFen, moves);
  if (!pos) return 0;
  return expectedFor(pos.lines[0].score, color) - epBefore;
}

export function stopCoach() {
  engine?.terminate();
  engine = null;
  seen.clear();
}
