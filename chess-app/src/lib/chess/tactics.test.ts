import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { hangingPieces, lineMaterial, moveMotifs, sacrificeAmount, see } from './tactics';

describe('static exchange evaluation', () => {
  it('values a free piece and a defended one', () => {
    // White to move: black knight on d5 is undefended, white pawn e4 attacks it.
    expect(see(new Chess('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'd5')).toBe(3);
    // Same, but defended by a pawn on e6: PxN, PxP = +2 for white.
    expect(see(new Chess('4k3/8/4p3/3n4/4P3/8/8/4K3 w - - 0 1'), 'd5')).toBe(2);
    // Queen takes a pawn defended by a pawn: white should decline (0).
    expect(see(new Chess('4k3/8/4p3/3p4/8/8/3Q4/4K3 w - - 0 1'), 'd5')).toBe(0);
  });

  it('finds hanging pieces for the side not to move', () => {
    const chess = new Chess('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1');
    const h = hangingPieces(chess, 'b');
    expect(h[0]).toMatchObject({ square: 'd5', type: 'n', undefended: true });
  });
});

describe('motifs', () => {
  it('detects a knight fork', () => {
    const motifs = moveMotifs('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7');
    expect(motifs.map((m) => m.kind)).toContain('fork');
  });

  it('detects a pin', () => {
    const motifs = moveMotifs('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5');
    expect(motifs.map((m) => m.kind)).toContain('pin');
  });

  it('detects checkmate and mate threats', () => {
    expect(moveMotifs('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8')[0].kind).toBe('mate');
    const m = moveMotifs('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', 'd1h5');
    expect(m.map((x) => x.kind)).toContain('threatensMate');
  });
});

describe('material lines', () => {
  it('stops at a quiet point', () => {
    // 1. Nxd5 exd5 is an even trade even though Nxd5 alone looks like +3.
    const fen = '4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1';
    expect(lineMaterial(fen, ['c3d5', 'e6d5'], 'w').delta).toBe(0);
    expect(lineMaterial(fen, ['c3d5', 'e8d7'], 'w').delta).toBe(3);
  });

  it('measures sacrifices', () => {
    // Greek gift: Bxh7+ gives up a bishop for a pawn.
    const fen = 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 1';
    expect(sacrificeAmount(fen, 'd3h7').amount).toBe(2);
    expect(sacrificeAmount(fen, 'a2a3').amount).toBe(0);
  });
});
