import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const SQUARES: Square[] = (() => {
  const out: Square[] = [];
  for (const r of '87654321') for (const f of 'abcdefgh') out.push((f + r) as Square);
  return out;
})();

/** FEN without the move counters - identifies a position for book/transposition lookups. */
export function epd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function parseUci(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PieceSymbol | undefined) || undefined,
  };
}

export const moveToUci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '');

/** Plays a UCI move on a chess.js instance; returns null if illegal. */
export function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move(parseUci(uci));
  } catch {
    return null;
  }
}

export function sanLine(fen: string, uciMoves: string[], max = 99): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const u of uciMoves.slice(0, max)) {
    const m = playUci(chess, u);
    if (!m) break;
    out.push(m.san);
  }
  return out;
}

/** Formats SAN moves with move numbers, e.g. "12. Nf3 Nc6 13. Bb5" or "12... Nc6 13. Bb5". */
export function formatLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let moveNo = +parts[5] || 1;
  let white = parts[1] !== 'b';
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (white) out.push(`${moveNo}. ${san}`);
    else out.push(i === 0 ? `${moveNo}... ${san}` : san);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

export function materialCount(chess: Chess): { w: number; b: number } {
  const m = { w: 0, b: 0 };
  for (const row of chess.board()) for (const p of row) if (p) m[p.color] += PIECE_VALUE[p.type];
  return m;
}

/** Material from `color`'s point of view (own minus opponent). */
export function materialBalance(chess: Chess, color: Color): number {
  const m = materialCount(chess);
  return color === 'w' ? m.w - m.b : m.b - m.w;
}

export function nonPawnPieces(chess: Chess): number {
  let n = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') n++;
  return n;
}

/** Captured pieces per side, relative to the standard starting material. */
export function capturedPieces(fen: string): { w: PieceSymbol[]; b: PieceSymbol[]; diff: number } {
  const start: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const counts = { w: { ...start }, b: { ...start } };
  const board = fen.split(' ')[0];
  for (const ch of board) {
    if (!/[a-zA-Z]/.test(ch)) continue;
    const color = ch === ch.toUpperCase() ? 'w' : 'b';
    counts[color][ch.toLowerCase() as PieceSymbol]--;
  }
  // `w` lists pieces White has captured (i.e. missing black pieces).
  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  const list = (c: 'w' | 'b') => order.flatMap((t) => Array(Math.max(0, counts[c][t])).fill(t) as PieceSymbol[]);
  const bMissing = list('b');
  const wMissing = list('w');
  const val = (l: PieceSymbol[]) => l.reduce((s, t) => s + PIECE_VALUE[t], 0);
  return { w: bMissing, b: wMissing, diff: val(bMissing) - val(wMissing) };
}

export function legalDests(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from);
    if (list) list.push(m.to);
    else dests.set(m.from, [m.to]);
  }
  return dests;
}

export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const p = chess.get(from);
  return !!p && p.type === 'p' && (to[1] === '8' || to[1] === '1');
}

export function safeChess(fen?: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

export function validateFen(fen: string): string | null {
  try {
    new Chess(fen);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid FEN';
  }
}

export function squareName(sq: string) {
  return sq;
}
