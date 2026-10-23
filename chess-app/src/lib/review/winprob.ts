import type { Color } from 'chess.js';
import type { Score } from '../engine/uci';

// Logistic model fitted by lichess on human games (see lila's WinPercent.scala).
export const WIN_K = 0.00368208;

/** White's expected score (0..1) for a centipawn evaluation. */
export function cpToExpected(cp: number): number {
  const c = Math.max(-2000, Math.min(2000, cp));
  return 1 / (1 + Math.exp(-WIN_K * c));
}

/** White's expected score (0..1) for an engine score from White's perspective. */
export function scoreToExpected(score: Score): number {
  if (score.type === 'mate') {
    if (score.value > 0) return 1;
    if (score.value < 0) return 0;
    return 0.5;
  }
  return cpToExpected(score.value);
}

/** Expected points for `color`. */
export function expectedFor(score: Score, color: Color): number {
  const w = scoreToExpected(score);
  return color === 'w' ? w : 1 - w;
}

/** Lichess win% (0..100, White) with centipawns capped to +-1000 and mates at the cap. */
export function winPercent(score: Score): number {
  let cp: number;
  if (score.type === 'mate') cp = score.value === 0 ? 0 : Math.sign(score.value) * 1000;
  else cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_K * cp)) - 1);
}

/** Centipawns from White's perspective, mates clamped (used for ACPL and graphs). */
export function clampedCp(score: Score, cap = 1000): number {
  if (score.type === 'mate') return score.value === 0 ? 0 : Math.sign(score.value) * cap;
  return Math.max(-cap, Math.min(cap, score.value));
}

/** Eval bar fill for White in [0,1]; a gentle curve so small edges are visible. */
export function evalBarFraction(score: Score | undefined): number {
  if (!score) return 0.5;
  if (score.type === 'mate') return score.value > 0 ? 1 : score.value < 0 ? 0 : 0.5;
  const v = Math.max(-1500, Math.min(1500, score.value));
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.004 * v)) - 1);
}
