// Graduated hints for "find the better move" exercises: first the idea, then the piece.
import { Chess, type Square } from 'chess.js';
import { moveMotifs, type MotifKind } from '../chess/tactics';
import { PIECE_NAME, playUci } from '../chess/utils';

export interface Hints {
  idea: string;
  piece: string;
  /** Square of the piece to move, for highlighting on the second hint. */
  square: string;
}

export function hintsFor(fen: string, bestUci: string, bestSan: string, opts: { recaptureSquare?: string; line?: string[] } = {}): Hints {
  const from = bestUci.slice(0, 2);
  const chess = new Chess(fen);
  const piece = chess.get(from as Square);
  const kinds = new Set(moveMotifs(fen, bestUci, opts.recaptureSquare).map((m) => m.kind));
  const mateSoon = (opts.line ?? []).slice(0, 5).some((s) => s.includes('#'));
  let motif: string | undefined;
  if (kinds.has('recapture')) motif = 'Your opponent just captured. Can you take back?';
  else if (kinds.has('fork')) motif = 'Look for a move that attacks two things at once.';
  else if (kinds.has('pin') || kinds.has('skewer')) motif = 'Look along the lines: is there a pin or a skewer?';
  else if (kinds.has('discovered') || kinds.has('discoveredCheck')) motif = 'Moving one piece could unleash another one behind it.';
  else if (kinds.has('threatensMate')) motif = 'Look for a move that threatens checkmate.';
  else if (kinds.has('escapes')) motif = 'One of your pieces is under attack.';
  else if (kinds.has('defends')) motif = 'Something of yours needs protecting.';
  else if (kinds.has('freePiece') || kinds.has('winsMaterial')) motif = 'Is any enemy piece undefended? Look at the captures.';
  let idea: string;
  if (bestSan.includes('#')) idea = 'There is a checkmate in one!';
  else if (mateSoon) idea = 'There is a forced checkmate - start with the most forcing move.';
  else if (chess.inCheck())
    idea = `You're in check. Compare every way out - moving the king, blocking or capturing. ${motif ?? 'Which one leaves you safest?'}`;
  else if (motif) idea = motif;
  else if (bestSan.includes('x')) idea = 'Look at the captures.';
  else if (bestSan.includes('+')) idea = 'Look at the checks.';
  else if (kinds.has('castle')) idea = 'Think about the safety of your king.';
  else if (kinds.has('develops')) idea = 'Bring a new piece into the game.';
  else idea = 'Which of your pieces is doing the least? Improve it, and check what your opponent is threatening.';
  const name = piece ? (piece.type === 'k' ? 'king' : PIECE_NAME[piece.type]) : 'piece';
  return { idea, piece: `Move your ${name} on ${from}.`, square: from };
}

const PUNISHING: MotifKind[] = [
  'mate',
  'threatensMate',
  'fork',
  'discoveredCheck',
  'skewer',
  'discovered',
  'pin',
  'freePiece',
  'winsMaterial',
  'recapture',
  'promotion',
];

/**
 * Why a wrong try fails, from the opponent's best reply in the position after it,
 * e.g. "Your opponent answers Qxg2, which forks the rook on h1 and the pawn on e4."
 * `ep` is the trying side's expected score after the try (0..1).
 */
export function refutationText(fenAfterTry: string, replyUci: string | undefined, ep: number): string | null {
  if (!replyUci) return null;
  const c = new Chess(fenAfterTry);
  const mv = playUci(c, replyUci);
  if (!mv) return null;
  if (c.isCheckmate()) return `Your opponent answers ${mv.san} - checkmate.`;
  const motif = moveMotifs(fenAfterTry, replyUci).find((m) => PUNISHING.includes(m.kind));
  if (motif) return `Your opponent answers ${mv.san}, which ${motif.text}.`;
  if (ep >= 0.6) return 'That move is playable, but there is something clearly stronger.';
  if (ep >= 0.4) return `After ${mv.san} the position is about equal - your advantage is gone.`;
  return `After ${mv.san} your opponent is better.`;
}
