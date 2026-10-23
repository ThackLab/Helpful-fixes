import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from './accuracy';
import { classifyMove } from './classify';
import type { PositionEval } from './types';
import { cpToExpected, winPercent } from './winprob';

const pos = (fen: string, cps: number[], pvs: string[][]): PositionEval => ({
  fen,
  depth: 18,
  lines: cps.map((cp, i) => ({ score: { type: 'cp', value: cp }, pv: pvs[i] ?? [], san: [], depth: 18 })),
});

describe('win probability and accuracy', () => {
  it('is symmetric and monotonic', () => {
    expect(cpToExpected(0)).toBeCloseTo(0.5);
    expect(cpToExpected(300)).toBeGreaterThan(cpToExpected(100));
    expect(cpToExpected(-200)).toBeCloseTo(1 - cpToExpected(200));
    expect(winPercent({ type: 'mate', value: 3 })).toBeCloseTo(winPercent({ type: 'cp', value: 1000 }));
  });

  it('scores perfect and terrible moves', () => {
    expect(moveAccuracy(60, 60)).toBe(100);
    expect(moveAccuracy(80, 20)).toBeLessThan(10);
    const acc = gameAccuracy([50, 52, 50, 51, 49, 50]);
    expect(acc.w).toBeGreaterThan(90);
    expect(acc.b).toBeGreaterThan(90);
  });
});

describe('classification', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('labels the engine move as best and big drops as blunders', () => {
    const before = pos(start, [30, 25], [['e2e4'], ['d2d4']]);
    expect(
      classifyMove({ before, after: pos(afterE4, [30], [['e7e5']]), uci: 'e2e4', color: 'w', legalMoves: 20, isBook: false }).classification,
    ).toBe('best');
    const bad = classifyMove({ before, after: pos(afterE4, [-400], [['e7e5']]), uci: 'f2f3', color: 'w', legalMoves: 20, isBook: false });
    expect(bad.classification).toBe('blunder');
    const meh = classifyMove({ before, after: pos(afterE4, [-60], [['e7e5']]), uci: 'f2f3', color: 'w', legalMoves: 20, isBook: false });
    expect(meh.classification).toBe('inaccuracy');
  });

  it('respects book and forced moves', () => {
    const before = pos(start, [30], [['e2e4']]);
    const after = pos(afterE4, [25], [['e7e5']]);
    expect(classifyMove({ before, after, uci: 'd2d4', color: 'w', legalMoves: 20, isBook: true }).classification).toBe('book');
    expect(classifyMove({ before, after, uci: 'd2d4', color: 'w', legalMoves: 1, isBook: false }).classification).toBe('forced');
  });
});
