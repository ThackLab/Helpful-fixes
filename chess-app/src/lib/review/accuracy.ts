// Accuracy model ported from lichess (lila/modules/analyse AccuracyPercent.scala).
// Per-move accuracy comes from the drop in win%; game accuracy blends a
// volatility-weighted mean with the harmonic mean so that a single blunder
// costs more than many tiny slips.

/** Accuracy (0..100) of a move given the mover's win% before and after it. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const diff = winBefore - winAfter;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1)); // +1 uncertainty bonus, as lichess does
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

function weightedMean(pairs: [number, number][]): number | null {
  const wsum = pairs.reduce((a, [, w]) => a + w, 0);
  if (!pairs.length || wsum === 0) return null;
  return pairs.reduce((a, [v, w]) => a + v * w, 0) / wsum;
}

function harmonicMean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 1), 0);
}

/**
 * @param winPercents White win% for every position from the start of the
 *   game (index 0) to the final position.
 * @param whiteMovesFirst whether the first move in the list is White's.
 */
export function gameAccuracy(winPercents: number[], whiteMovesFirst = true): { w: number | null; b: number | null } {
  const n = winPercents.length - 1;
  if (n < 1) return { w: null, b: null };
  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(windowSize, winPercents.length) - 2; i++) windows.push(winPercents.slice(0, windowSize));
  for (let i = 0; i + windowSize <= winPercents.length; i++) windows.push(winPercents.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));

  const per: { w: [number, number][]; b: [number, number][] } = { w: [], b: [] };
  for (let i = 0; i < n; i++) {
    const white = (i % 2 === 0) === whiteMovesFirst;
    const prev = winPercents[i];
    const next = winPercents[i + 1];
    const acc = white ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    (white ? per.w : per.b).push([acc, weights[i] ?? weights[weights.length - 1] ?? 1]);
  }
  const combine = (list: [number, number][]) => {
    const wm = weightedMean(list);
    const hm = harmonicMean(list.map(([a]) => a));
    return wm === null || hm === null ? null : (wm + hm) / 2;
  };
  return { w: combine(per.w), b: combine(per.b) };
}

/**
 * Rough performance-rating estimate from average centipawn loss, fitted to
 * widely published rating-vs-ACPL curves. Short games are pulled towards the
 * middle because a handful of moves says little about strength.
 */
export function estimateRating(acpl: number, accuracy: number, moves: number): number {
  const fromAcpl = 4916 - 818 * Math.log(Math.max(6, acpl));
  const fromAcc = 400 + 2800 * Math.pow(Math.max(0, accuracy - 40) / 60, 1.6);
  let est = 0.6 * fromAcpl + 0.4 * fromAcc;
  const confidence = Math.min(1, moves / 25);
  est = 1500 + (est - 1500) * (0.4 + 0.6 * confidence);
  return Math.round(Math.max(100, Math.min(3200, est)) / 25) * 25;
}
