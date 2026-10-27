// Themed tactics puzzles (generated offline from bot games, see src/test/puzzleGen.test.ts).
import { Chess } from 'chess.js';
import { playUci, sanLine } from '../chess/utils';
import { describeMaterial, lineMaterial, moveMotifs, sacrificeAmount } from '../chess/tactics';
import type { PuzzleTheme } from './tags';

export interface TacticPuzzle {
  id: string;
  /** Position before the opponent's mistake (or, with `noPrev`, the puzzle position itself). */
  fen: string;
  /** The opponent's mistake, then the solution: solver, reply, solver, ... (with `noPrev`, just the solution). */
  moves: string[];
  themes: PuzzleTheme[];
  /** Difficulty on the app's Elo-like scale (measured by the bots). */
  rating: number;
  /** The position comes without the move that led to it (classic collections). */
  noPrev?: boolean;
  /** Where the position comes from, e.g. "Win at Chess #12" or "Lichess game". */
  source?: string;
}

/** The position the puzzle starts from, the opponent's move to show first (if any), and the solution. */
export function puzzleSetup(p: TacticPuzzle): { fen: string; startMove?: string; line: string[] } {
  return p.noPrev ? { fen: p.fen, line: p.moves } : { fen: p.fen, startMove: p.moves[0], line: p.moves.slice(1) };
}

/** The solution in SAN. */
export function solutionSan(p: TacticPuzzle): string {
  return sanLine(puzzlePosition(p), puzzleSetup(p).line).join(' ');
}

/** The position the solver has to find a move in. */
export function puzzlePosition(p: TacticPuzzle): string {
  if (p.noPrev) return p.fen;
  const c = new Chess(p.fen);
  playUci(c, p.moves[0]);
  return c.fen();
}

/** Heuristic difficulty: longer, quieter and sacrificial solutions are harder. */
export function puzzleRating(p: Pick<TacticPuzzle, 'fen' | 'moves' | 'themes' | 'noPrev'>): number {
  const { line } = puzzleSetup(p as TacticPuzzle);
  const chess = new Chess(puzzlePosition(p as TacticPuzzle));
  const solverMoves = Math.ceil(line.length / 2);
  const firstFen = chess.fen();
  const first = playUci(chess, line[0]);
  let r = 700 + (solverMoves - 1) * 250;
  if (first && !first.captured && !chess.inCheck()) r += 300;
  if (first && sacrificeAmount(firstFen, line[0]).amount >= 2) r += 250;
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
/**
 * The idea of a puzzle drawn on its starting position: the key move, and arrows
 * to what it attacks (fork targets, the piece behind a pin, the target of a
 * discovered attack). Arrows use the lesson format, e.g. "r:c7e8".
 */
export function puzzleIdea(p: TacticPuzzle): { fen: string; arrows: string[]; marks: string[] } {
  const fen = puzzlePosition(p);
  const key = puzzleSetup(p).line[0];
  const to = key.slice(2, 4);
  const arrows = [key.slice(0, 4)];
  const marks: string[] = [];
  for (const m of moveMotifs(fen, key)) {
    const sq = m.squares ?? [];
    if (m.kind === 'fork' || m.kind === 'attacks') arrows.push(...sq.slice(1).map((t) => `r:${to}${t}`));
    else if ((m.kind === 'pin' || m.kind === 'skewer') && sq.length === 3) {
      arrows.push(`r:${to}${sq[2]}`);
      marks.push(sq[1]);
    } else if ((m.kind === 'discovered' || m.kind === 'discoveredCheck') && sq.length === 2) arrows.push(`r:${sq[0]}${sq[1]}`);
    else if (m.kind === 'threatensMate' && sq.length === 2) arrows.push(`y:${sq[0]}${sq[1]}`);
    else if (m.kind === 'freePiece' || m.kind === 'winsMaterial' || m.kind === 'mate') marks.push(to);
  }
  return { fen, arrows: [...new Set(arrows)], marks: [...new Set(marks)] };
}

export function explainPuzzle(p: TacticPuzzle): string {
  const fen = puzzlePosition(p);
  const solver = new Chess(fen).turn();
  const line = puzzleSetup(p).line;
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
