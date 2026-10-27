// Engine checks shared by the puzzle miner and the puzzle importer.
import { Chess, type Color } from 'chess.js';
import { playUci } from '../lib/chess/utils';
import type { Engine } from '../lib/engine/engine';
import type { PvLine } from '../lib/engine/uci';
import { expectedFor } from '../lib/review/winprob';

export const ep = (l: PvLine | undefined, c: Color) => (l ? expectedFor(l.score, c) : 0);
export const isMateFor = (l: PvLine | undefined, c: Color) => !!l && l.score.type === 'mate' && l.score.value > 0 === (c === 'w');
export const cpFor = (l: PvLine, c: Color) => (l.score.type === 'mate' ? (l.score.value > 0 ? 10000 : -10000) : l.score.value) * (c === 'w' ? 1 : -1);

/**
 * The best move is the only one that works: mate in one, a mate clearly faster
 * than any other, or clearly better than every alternative.
 */
export function uniqueBest(lines: PvLine[], c: Color): boolean {
  const [best, second] = lines;
  if (!best?.pv.length) return false;
  if (isMateFor(best, c) && best.score.type === 'mate' && Math.abs(best.score.value) === 1)
    return !isMateFor(second, c) || Math.abs(second.score.value) > 1;
  if (!second) return true;
  if (isMateFor(second, c)) return isMateFor(best, c) && Math.abs(second.score.value) >= Math.abs(best.score.value) + 2;
  return cpFor(best, c) - cpFor(second, c) >= 150 && ep(best, c) - ep(second, c) >= 0.15;
}

/** Follows the engine's line while the solver's move stays unique. */
export async function solve(ana: Engine, fen: string, solver: Color, first: PvLine[], maxSolverMoves = 4): Promise<string[] | null> {
  const line: string[] = [];
  let lines = first;
  const chess = new Chess(fen);
  for (let step = 0; step < maxSolverMoves; step++) {
    const best = lines[0];
    if (!uniqueBest(lines, solver)) break;
    line.push(best.pv[0]);
    playUci(chess, best.pv[0]);
    if (chess.isGameOver()) break;
    // The puzzle may end once the gain is banked and the next move isn't forced.
    const reply = await ana.analyse({ fen: chess.fen(), limits: { depth: 16, movetime: 2000 }, multipv: 1 });
    const r = reply.lines[0]?.pv[0];
    if (!r) break;
    const probe = new Chess(chess.fen());
    playUci(probe, r);
    const next = await ana.analyse({ fen: probe.fen(), limits: { depth: 16, movetime: 2000 }, multipv: 2 });
    if (!uniqueBest(next.lines, solver) || step === maxSolverMoves - 1) break;
    line.push(r);
    playUci(chess, r);
    lines = next.lines;
  }
  if (!line.length || line.length % 2 === 0) return line.length ? line.slice(0, -1) : null;
  return line;
}
