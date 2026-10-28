import { describe, expect, it } from 'vitest';
import { computeInsights, type ReviewedGame } from './insights';
import type { GameReview, ReviewedMove } from './review/types';
import type { GameRecord } from './storage/db';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A reviewed game in which White's expected points follow `ep` move by move. */
function game(opts: { id: string; result: string; ep: number[]; at: number; opening?: string; accuracy?: number }): ReviewedGame {
  const moves = opts.ep.map(
    (e, i) =>
      ({
        ply: i * 2,
        color: 'w',
        san: 'e4',
        uci: 'e2e4',
        fenBefore: START,
        fenAfter: START,
        classification: 'good',
        epBefore: e,
        epAfter: e,
        epLoss: 0.01,
        winAfter: 50,
        accuracy: 90,
        cpLoss: 5,
        bestMove: 'e2e4',
        bestSan: 'e4',
        bestLine: [],
        replyLine: [],
        phase: i < 2 ? 'opening' : 'middlegame',
        headline: '',
        comment: '',
        tags: [],
      }) as unknown as ReviewedMove,
  );
  const side = { accuracy: opts.accuracy ?? 80, acpl: 30, estimatedRating: 1000, counts: { blunder: 1 }, phases: {} };
  const review = { moves, white: side, black: side, opening: opts.opening ? { eco: 'B20', name: opts.opening } : undefined } as unknown as GameReview;
  const record = {
    id: opts.id,
    createdAt: opts.at,
    result: opts.result,
    userColor: 'w',
    startFen: START,
    moves: [],
    sans: [],
  } as unknown as GameRecord;
  return { game: record, review, color: 'w' };
}

describe('insights', () => {
  const now = new Date(2026, 9, 20).getTime();
  const thisMonth = new Date(2026, 9, 5).getTime();
  const lastMonth = new Date(2026, 8, 10).getTime();
  const games = [
    game({ id: 'a', result: '1-0', ep: [0.5, 0.9, 0.95], at: thisMonth, opening: 'Sicilian Defense: Najdorf', accuracy: 90 }),
    game({ id: 'b', result: '0-1', ep: [0.5, 0.92, 0.3], at: thisMonth, opening: 'Sicilian Defense: Dragon', accuracy: 70 }),
    game({ id: 'c', result: '1/2-1/2', ep: [0.5, 0.1, 0.5], at: lastMonth, opening: 'Italian Game', accuracy: 60 }),
  ];
  const ins = computeInsights(games, now);

  it('counts winning positions and how they ended', () => {
    expect(ins.conversion).toEqual({ winning: 2, won: 1, drawn: 0, lost: 1 });
    expect(ins.comebacks).toEqual({ losing: 1, saved: 1 });
  });

  it('groups openings by family and colour', () => {
    expect(ins.openings).toEqual([{ name: 'Sicilian Defense', color: 'w', games: 2, score: 0.5 }]);
  });

  it('compares this month with the last', () => {
    expect(ins.thisMonth.games).toBe(2);
    expect(ins.thisMonth.accuracy).toBe(80);
    expect(ins.lastMonth.games).toBe(1);
    expect(ins.lastMonth.accuracy).toBe(60);
  });

  it('splits lost points by phase', () => {
    expect(ins.phases.opening).toBeCloseTo(0.02);
    expect(ins.phases.middlegame).toBeCloseTo(0.01);
  });
});
