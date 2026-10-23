// Themed tactics puzzles (generated offline from bot games, see src/test/puzzleGen.test.ts).
import { Chess } from 'chess.js';
import { playUci, sanLine } from '../chess/utils';
import { describeMaterial, lineMaterial, moveMotifs, sacrificeAmount } from '../chess/tactics';
import type { PuzzleTheme } from './tags';

export interface TacticPuzzle {
  id: string;
  /** Position before the opponent's mistake. */
  fen: string;
  /** The opponent's mistake, then the solution: solver, reply, solver, ... */
  moves: string[];
  themes: PuzzleTheme[];
  /** Rough difficulty on an Elo-like scale. */
  rating: number;
}

/** Heuristic difficulty: longer, quieter and sacrificial solutions are harder. */
export function puzzleRating(p: Pick<TacticPuzzle, 'fen' | 'moves' | 'themes'>): number {
  const chess = new Chess(p.fen);
  playUci(chess, p.moves[0]);
  const solverMoves = Math.ceil((p.moves.length - 1) / 2);
  const firstFen = chess.fen();
  const first = playUci(chess, p.moves[1]);
  let r = 700 + (solverMoves - 1) * 250;
  if (first && !first.captured && !chess.inCheck()) r += 300;
  if (first && sacrificeAmount(firstFen, p.moves[1]).amount >= 2) r += 250;
  if (p.themes.includes('hanging')) r -= 250;
  if (p.themes.includes('mateIn1')) r -= 150;
  if (p.themes.includes('setup')) r += 150;
  return Math.max(400, Math.min(2400, r));
}

let cache: Promise<TacticPuzzle[]> | null = null;

export function loadPuzzles(): Promise<TacticPuzzle[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}puzzles.json`)
    .then((r) => (r.ok ? (r.json() as Promise<TacticPuzzle[]>) : []))
    .catch(() => []);
  return cache;
}

/** Plain-English explanation of a puzzle's solution. */
export function explainPuzzle(p: TacticPuzzle): string {
  const start = new Chess(p.fen);
  playUci(start, p.moves[0]);
  const fen = start.fen();
  const solver = start.turn();
  const line = p.moves.slice(1);
  const sans = sanLine(fen, line);
  const end = new Chess(fen);
  for (const u of line) playUci(end, u);
  if (end.isCheckmate()) {
    const n = Math.ceil(line.length / 2);
    return n === 1 ? `${sans[0]} is checkmate.` : `${sans[0]} starts a forced mate in ${n}: ${sans.join(' ')}.`;
  }
  const motif = moveMotifs(fen, line[0]).find((m) => m.kind !== 'centre' && m.kind !== 'develops');
  const mat = lineMaterial(fen, line, solver, 12);
  const gain = mat.delta >= 1 ? ` In the end you win ${describeMaterial(mat.delta, mat.wonPieces, mat.lostPieces)}.` : '';
  return `${sans[0]}${motif ? ` ${motif.text}` : ''}.${gain}`;
}
