import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { lineMaterial, sacrificeAmount, see } from '../chess/tactics';
import { PIECE_VALUE, parseUci, playUci } from '../chess/utils';
import type { Score } from '../engine/uci';
import type { Classification, PositionEval } from './types';
import { expectedFor } from './winprob';

// Expected-points thresholds (the same scale chess.com documents publicly).
export const THRESHOLDS = {
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
};

export interface ClassifyInput {
  before: PositionEval;
  after: PositionEval;
  /** Position before the opponent's previous move (for "miss" detection). */
  prevBefore?: PositionEval;
  uci: string;
  color: Color;
  legalMoves: number;
  isBook: boolean;
  /** Expected-points loss of the opponent's previous move. */
  opponentLoss?: number;
  /** Square of the opponent's previous capture, if their last move was one. */
  recaptureSquare?: string;
}

export interface ClassifyResult {
  classification: Classification;
  epBefore: number;
  epAfter: number;
  epLoss: number;
  /** Expected points of the second-best move (when known). */
  epSecond?: number;
  sacrifice: number;
  sacrificePiece?: PieceSymbol;
  sacrificeSquare?: string;
}

/** Evaluation of a position from White's perspective, including terminal positions. */
export function evalScore(p: PositionEval): Score {
  if (p.terminal === 'checkmate') {
    // The side to move has been mated; a mate "in 0" signed for the winner.
    const whiteToMove = p.fen.split(' ')[1] === 'w';
    return { type: 'mate', value: whiteToMove ? -0.5 : 0.5 };
  }
  if (p.terminal === 'stalemate' || p.terminal === 'draw') return { type: 'cp', value: 0 };
  return p.lines[0]?.score ?? { type: 'cp', value: 0 };
}

const isMateFor = (s: Score | undefined, color: Color) => !!s && s.type === 'mate' && (color === 'w' ? s.value > 0 : s.value < 0);

export function classifyMove(input: ClassifyInput): ClassifyResult {
  const { before, after, uci, color } = input;
  const best = before.lines[0];
  const epBefore = expectedFor(evalScore(before), color);
  const epAfter = expectedFor(evalScore(after), color);
  const playedBest = !!best && best.pv[0] === uci;
  const epLoss = playedBest ? 0 : Math.max(0, epBefore - epAfter);
  const second = before.lines[1];
  const epSecond = second ? expectedFor(second.score, color) : undefined;
  const sac = sacrificeAmount(before.fen, uci);
  const base = { epBefore, epAfter, epLoss, epSecond, sacrifice: sac.amount, sacrificePiece: sac.piece, sacrificeSquare: sac.square };

  if (input.legalMoves === 1) return { ...base, classification: 'forced' };
  if (input.isBook && epLoss < THRESHOLDS.good) return { ...base, classification: 'book' };

  const bestIsMate = isMateFor(best?.score, color);
  const stillMating = isMateFor(evalScore(after), color);

  // Brilliant: a sound sacrifice that is the best (or practically best) move,
  // played in a position that was not already completely won.
  if (epLoss <= 0.01 && sac.amount >= 2 && epAfter >= 0.5 && uci.length === 4) {
    const alreadyCrushing = epBefore > 0.97 && !stillMating;
    if (!alreadyCrushing) return { ...base, classification: 'brilliant' };
  }

  if (playedBest || epLoss <= 0.0001) {
    if (isGreat(input, epBefore, epAfter, epSecond)) return { ...base, classification: 'great' };
    return { ...base, classification: 'best' };
  }

  // Missing a short forced mate while staying clearly winning is a "miss".
  if (bestIsMate && !stillMating && best && Math.abs(best.score.value) <= 3 && epAfter > 0.75) {
    return { ...base, classification: 'miss' };
  }

  let cls: Classification;
  if (epLoss <= THRESHOLDS.excellent) cls = 'excellent';
  else if (epLoss <= THRESHOLDS.good) cls = 'good';
  else if (epLoss <= THRESHOLDS.inaccuracy) cls = 'inaccuracy';
  else if (epLoss <= THRESHOLDS.mistake) cls = 'mistake';
  else cls = 'blunder';

  if ((cls === 'mistake' || cls === 'blunder') && isMiss(input, epAfter, bestIsMate)) cls = 'miss';
  return { ...base, classification: cls };
}

function isObviousCapture(fen: string, uci: string): boolean {
  const chess = new Chess(fen);
  const m = playUci(chess, uci);
  if (!m?.captured) return false;
  // Taking a piece that cannot be recaptured profitably is not a hard find.
  return PIECE_VALUE[m.captured] >= 3 && see(chess, m.to) < PIECE_VALUE[m.captured];
}

function isGreat(input: ClassifyInput, epBefore: number, epAfter: number, epSecond?: number): boolean {
  if (epSecond === undefined) return false;
  const gap = epBefore - epSecond;
  const chess = new Chess(input.before.fen);
  const { to } = parseUci(input.uci);
  // Delivering mate is reported as "best"; the coach already says "checkmate".
  const probe = new Chess(input.before.fen);
  if (playUci(probe, input.uci) && probe.isCheckmate()) return false;
  // Plain recaptures and grabbing hanging pieces are obvious, not "great".
  if (input.recaptureSquare === to && chess.get(to)) return false;
  if (chess.inCheck() && input.legalMoves <= 3) return false;
  if (isObviousCapture(input.before.fen, input.uci)) return false;
  // Everything wins anyway / everything loses anyway.
  if (epSecond > 0.9 || epAfter < 0.15) return false;
  if (gap >= 0.18) return true;
  // Punishing an opponent's mistake with the only move that does so.
  return (input.opponentLoss ?? 0) >= THRESHOLDS.inaccuracy && gap >= 0.1;
}

/**
 * "Miss": the player had a clear chance (the opponent just erred, or a
 * tactic won material) and let it go, without actually ruining the position.
 */
function isMiss(input: ClassifyInput, epAfter: number, bestIsMate: boolean): boolean {
  const best = input.before.lines[0];
  if (input.prevBefore && (input.opponentLoss ?? 0) >= THRESHOLDS.inaccuracy) {
    const epPrev = expectedFor(evalScore(input.prevBefore), input.color);
    const epBefore = expectedFor(evalScore(input.before), input.color);
    if (epBefore - epPrev >= 0.1 && epAfter >= epPrev - 0.05) return true;
  }
  if (!best || epAfter < 0.4) return false;
  if (bestIsMate) return true;
  const gain = lineMaterial(input.before.fen, best.pv, input.color, 8);
  return gain.delta >= 2;
}
