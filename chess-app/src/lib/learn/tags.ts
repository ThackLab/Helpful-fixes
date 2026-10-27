// Theme tags for tactics puzzles, derived from the solution line.
import { Chess, type Color, type Square } from 'chess.js';
import { moveMotifs, sacrificeAmount, type MotifKind } from '../chess/tactics';
import { other, playUci } from '../chess/utils';

export type PuzzleTheme =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered'
  | 'doubleCheck'
  | 'hanging'
  | 'removeDefender'
  | 'sacrifice'
  | 'setup'
  | 'promotion'
  | 'mateIn1'
  | 'mateIn2'
  | 'mateIn3'
  | 'backRankMate'
  | 'smotheredMate';

const TACTIC_KINDS: MotifKind[] = ['fork', 'pin', 'skewer', 'discovered', 'discoveredCheck'];

function kingSquare(chess: Chess, color: Color): Square | undefined {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return undefined;
}

function neighbours(sq: Square): Square[] {
  const f = sq.charCodeAt(0) - 97;
  const r = +sq[1] - 1;
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const nf = f + df;
      const nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push(`${String.fromCharCode(97 + nf)}${nr + 1}` as Square);
    }
  return out;
}

/**
 * Tags a puzzle. `fen` is the position with the solver to move and `line`
 * alternates solver moves and replies, starting and ending with the solver.
 */
export function tagPuzzle(fen: string, line: string[]): PuzzleTheme[] {
  const chess = new Chess(fen);
  const solver = chess.turn();
  const tags = new Set<PuzzleTheme>();
  let firstTacticAt = -1;
  let forcingStart = false;
  const solverMoves: { uci: string; captured?: Square; before: string }[] = [];
  for (let i = 0; i < line.length; i++) {
    const before = chess.fen();
    const uci = line[i];
    const mine = i % 2 === 0;
    const motifs = mine ? moveMotifs(before, uci) : [];
    const sac = mine ? sacrificeAmount(before, uci).amount : 0;
    const m = playUci(chess, uci);
    if (!m) break;
    if (!mine) continue;
    const n = solverMoves.length;
    solverMoves.push({ uci, captured: m.captured ? (m.to as Square) : undefined, before });
    const kinds = new Set(motifs.map((x) => x.kind));
    if (kinds.has('fork')) tags.add('fork');
    if (kinds.has('pin')) tags.add('pin');
    if (kinds.has('skewer')) tags.add('skewer');
    if (kinds.has('discovered') || kinds.has('discoveredCheck')) tags.add('discovered');
    if (m.promotion) tags.add('promotion');
    if (sac >= 2) tags.add('sacrifice');
    if (chess.inCheck()) {
      const k = kingSquare(chess, other(solver));
      if (k && chess.attackers(k, solver).length >= 2) {
        tags.add('doubleCheck');
        kinds.add('discoveredCheck');
      }
    }
    if (n === 0) {
      forcingStart = chess.inCheck() || !!m.captured || sac >= 2;
      if (kinds.has('freePiece') && line.length <= 3) tags.add('hanging');
    }
    if (firstTacticAt < 0 && TACTIC_KINDS.some((k) => kinds.has(k))) firstTacticAt = n;
  }

  // Taking the piece that guarded something, then taking what it guarded.
  if (solverMoves.length >= 2 && solverMoves[0].captured) {
    const first = new Chess(solverMoves[0].before);
    const defender = solverMoves[0].captured;
    for (const later of solverMoves.slice(1)) {
      if (!later.captured) continue;
      if (first.get(later.captured)?.color === other(solver) && first.attackers(later.captured, other(solver)).includes(defender)) {
        tags.add('removeDefender');
        break;
      }
    }
  }
  if (firstTacticAt >= 1 && forcingStart) tags.add('setup');

  if (chess.isCheckmate()) {
    const n = solverMoves.length;
    if (n === 1) tags.add('mateIn1');
    else if (n === 2) tags.add('mateIn2');
    else if (n === 3) tags.add('mateIn3');
    const loser = other(solver);
    const k = kingSquare(chess, loser);
    const last = solverMoves[n - 1].uci;
    const mover = chess.get(last.slice(2, 4) as Square);
    if (k && mover) {
      const backRank = loser === 'w' ? '1' : '8';
      if (k[1] === backRank && (mover.type === 'r' || mover.type === 'q') && last[3] === backRank) tags.add('backRankMate');
      if (mover.type === 'n' && neighbours(k).every((sq) => chess.get(sq)?.color === loser)) tags.add('smotheredMate');
    }
  }
  return [...tags];
}

export const THEME_INFO: Record<PuzzleTheme, { title: string; lesson?: string }> = {
  fork: { title: 'Fork', lesson: 'forks' },
  pin: { title: 'Pin', lesson: 'pins' },
  skewer: { title: 'Skewer', lesson: 'skewers' },
  discovered: { title: 'Discovered attack', lesson: 'discovered' },
  doubleCheck: { title: 'Double check', lesson: 'discovered' },
  hanging: { title: 'Loose piece', lesson: 'loose-pieces' },
  removeDefender: { title: 'Removing the defender', lesson: 'remove-defender' },
  sacrifice: { title: 'Sacrifice', lesson: 'king-attack' },
  setup: { title: 'Combination', lesson: 'calculation' },
  promotion: { title: 'Promotion', lesson: 'promotion' },
  mateIn1: { title: 'Mate in 1', lesson: 'cct' },
  mateIn2: { title: 'Mate in 2', lesson: 'mating-nets' },
  mateIn3: { title: 'Mate in 3', lesson: 'calculation' },
  backRankMate: { title: 'Back-rank mate', lesson: 'back-rank' },
  smotheredMate: { title: 'Smothered mate', lesson: 'smothered' },
};
