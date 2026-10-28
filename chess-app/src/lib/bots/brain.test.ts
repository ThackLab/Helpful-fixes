import { describe, expect, it } from 'vitest';
import type { Engine } from '../engine/engine';
import { customBot } from './bots';
import { chooseBotMove } from './brain';

/** Answers every search with the given lines, so the bot logic can run without Stockfish. */
function fakeEngine(lines: { pv: string[]; cp: number }[]): Engine {
  const result = {
    depth: 10,
    bestmove: lines[0]?.pv[0],
    lines: lines.map((l) => ({ pv: l.pv, score: { type: 'cp' as const, value: l.cp }, depth: 10, multipv: 1 })),
  };
  return { analyse: async () => result } as unknown as Engine;
}

describe('bot move choice', () => {
  it('still moves when every legal move is one it failed to notice', async () => {
    // White's only moves take one of two loose pawns (the king can't go to g1, the
    // bishop covers it), and a bot that notices nothing must still play one of them.
    const fen = 'k7/b7/8/8/8/6pp/6PP/7K w - - 0 1';
    const engine = fakeEngine([
      { pv: ['g2h3'], cp: 100 },
      { pv: ['h2g3'], cp: 90 },
    ]);
    const mv = await chooseBotMove(engine, { startFen: fen, moves: [], bot: customBot(250), rng: () => 0.99 });
    expect(['g2h3', 'h2g3']).toContain(mv.uci);
  });
});
