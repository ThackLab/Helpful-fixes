import { afterAll, describe, expect, it } from 'vitest';
import { nodeEngine } from '../../test/nodeEngine';

const engine = nodeEngine();
afterAll(() => engine.terminate());

describe('Engine', () => {
  it('finds mate in one from White perspective', async () => {
    const res = await engine.analyse({ fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', limits: { depth: 8 } });
    expect(res.bestmove).toBe('d1d8');
    expect(res.lines[0].score).toEqual({ type: 'mate', value: 1 });
  });

  it('normalises scores when Black is to move', async () => {
    const res = await engine.analyse({ fen: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', limits: { depth: 8 } });
    expect(res.bestmove).toBe('d8d1');
    expect(res.lines[0].score).toEqual({ type: 'mate', value: -1 });
  });

  it('returns multiple lines and supports stopping', async () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const res = await engine.analyse({ fen: start, limits: { depth: 10 }, multipv: 3 });
    expect(res.lines).toHaveLength(3);
    const h = engine.search({ fen: start, limits: { infinite: true } });
    setTimeout(() => h.stop(), 200);
    const r2 = await h.promise;
    expect(r2.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/);
  });

  it('handles positions with no legal moves', async () => {
    const res = await engine.analyse({ fen: '7k/5QQ1/8/8/8/8/8/6K1 b - - 0 1', limits: { depth: 5 } });
    expect(res.bestmove).toBeNull();
  });
});
