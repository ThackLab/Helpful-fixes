// Static board analysis used by the coach: exchanges, hanging pieces and
// common tactical motifs (forks, pins, skewers, discovered attacks, mate threats).
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE, SQUARES, materialBalance, other, playUci } from './utils';

type Board = ReturnType<Chess['board']>;
type Placed = { square: Square; type: PieceSymbol; color: Color };

const value = (t: PieceSymbol) => (t === 'k' ? 100 : PIECE_VALUE[t]);

function pieceAt(board: Board, sq: Square): Placed | null {
  const f = sq.charCodeAt(0) - 97;
  const r = 8 - +sq[1];
  return board[r][f] as Placed | null;
}

/**
 * Static exchange evaluation: the material the side to move can win by
 * starting a capture sequence on `square` (never negative - it may decline).
 * Uses real legal moves so pins and x-rays are handled correctly.
 */
export function see(chess: Chess, square: Square, depth = 0): number {
  const target = chess.get(square);
  if (!target || depth > 12) return 0;
  const caps = chess.moves({ verbose: true }).filter((m) => m.to === square);
  if (!caps.length) return 0;
  caps.sort((a, b) => value(a.piece) - value(b.piece) || (b.promotion ? 1 : 0) - (a.promotion ? 1 : 0));
  const cap = caps[0];
  const gainedPromotion = cap.promotion ? PIECE_VALUE[cap.promotion] - 1 : 0;
  if (target.type === 'k') return 100;
  chess.move(cap);
  const reply = see(chess, square, depth + 1);
  chess.undo();
  return Math.max(0, PIECE_VALUE[target.type] + gainedPromotion - reply);
}

/** Position with the other side to move (en passant cleared). Null when that would be illegal. */
export function flipTurn(chess: Chess): Chess | null {
  if (chess.inCheck()) return null;
  const parts = chess.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null;
  }
}

export interface Hanging {
  square: Square;
  type: PieceSymbol;
  /** Material the opponent wins by capturing (SEE). */
  loss: number;
  undefended: boolean;
}

/** Pieces of `color` that the opponent could win right now if it were their move. */
export function hangingPieces(chess: Chess, color: Color): Hanging[] {
  const pos = chess.turn() === color ? flipTurn(chess) : new Chess(chess.fen());
  if (!pos) return [];
  const out: Hanging[] = [];
  for (const row of pos.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      if (!pos.isAttacked(p.square, other(color))) continue;
      const loss = see(pos, p.square);
      if (loss > 0) out.push({ square: p.square, type: p.type, loss, undefended: !pos.isAttacked(p.square, color) });
    }
  }
  return out.sort((a, b) => b.loss - a.loss);
}

/** Squares attacked by the piece standing on `from` (pseudo-legal, includes x-ray-free lines only). */
export function attacksFrom(chess: Chess, from: Square): Square[] {
  const out: Square[] = [];
  for (const sq of SQUARES) {
    if (sq === from) continue;
    const p = chess.get(from);
    if (!p) return out;
    if (chess.attackers(sq, p.color).includes(from)) out.push(sq);
  }
  return out;
}

export type MotifKind =
  | 'mate'
  | 'check'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered'
  | 'discoveredCheck'
  | 'freePiece'
  | 'recapture'
  | 'winsMaterial'
  | 'threatensMate'
  | 'attacks'
  | 'castle'
  | 'promotion'
  | 'develops'
  | 'trade'
  | 'defends'
  | 'escapes'
  | 'centre';

export interface Motif {
  kind: MotifKind;
  /** Verb phrase without capital or full stop, e.g. "forks the king and rook". */
  text: string;
  squares?: Square[];
}

export const TACTICAL: MotifKind[] = ['fork', 'pin', 'skewer', 'discovered', 'discoveredCheck', 'threatensMate'];

/** "forks the king and rook" -> "Forks the king and rook." */
export function motifSentence(m: Motif): string {
  const t = m.text.charAt(0).toUpperCase() + m.text.slice(1);
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

const DIRS = {
  rook: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  bishop: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};

function step(sq: Square, df: number, dr: number): Square | null {
  const f = sq.charCodeAt(0) - 97 + df;
  const r = +sq[1] + dr;
  if (f < 0 || f > 7 || r < 1 || r > 8) return null;
  return (String.fromCharCode(97 + f) + r) as Square;
}

function rayPieces(board: Board, from: Square, df: number, dr: number, limit = 2): Placed[] {
  const out: Placed[] = [];
  let sq = step(from, df, dr);
  while (sq && out.length < limit) {
    const p = pieceAt(board, sq);
    if (p) out.push(p);
    sq = step(sq, df, dr);
  }
  return out;
}

function sliderDirs(t: PieceSymbol) {
  if (t === 'r') return DIRS.rook;
  if (t === 'b') return DIRS.bishop;
  if (t === 'q') return [...DIRS.rook, ...DIRS.bishop];
  return [];
}

const article = (t: PieceSymbol) => (t === 'k' ? 'the king' : `the ${PIECE_NAME[t]}`);
const listNames = (ps: { type: PieceSymbol }[]) => {
  const names = ps.map((p) => (p.type === 'k' ? 'king' : PIECE_NAME[p.type]));
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};
const plural = (t: PieceSymbol) => `${PIECE_NAME[t]}s`;

/**
 * Describes what a move does, most important idea first. `fenBefore` is the
 * position before the move; `recaptureSquare` is where the opponent just
 * captured (so taking back there is described as a recapture).
 */
export function moveMotifs(fenBefore: string, uci: string, recaptureSquare?: string): Motif[] {
  const chess = new Chess(fenBefore);
  const me = chess.turn();
  const them = other(me);
  const beforeBoard = chess.board();
  const hangingBefore = hangingPieces(chess, me);
  const m = playUci(chess, uci);
  if (!m) return [];
  const out: Motif[] = [];
  const board = chess.board();
  const name = PIECE_NAME[m.piece];
  const givesCheck = chess.inCheck();

  if (chess.isCheckmate()) return [{ kind: 'mate', text: 'delivers checkmate', squares: [m.to] }];

  if (m.isKingsideCastle() || m.isQueensideCastle()) {
    out.push({ kind: 'castle', text: 'castles, tucking the king away and connecting the rooks' });
  }
  if (m.promotion) out.push({ kind: 'promotion', text: `promotes to a ${PIECE_NAME[m.promotion]}` });

  // Captures: recapture, free piece, winning exchange or a trade.
  if (m.captured) {
    const capValue = PIECE_VALUE[m.captured];
    const recapture = see(chess, m.to);
    const net = capValue - recapture;
    const isRecapture = recaptureSquare === m.to;
    if (isRecapture) out.push({ kind: 'recapture', text: `recaptures the ${PIECE_NAME[m.captured]}`, squares: [m.to] });
    else if (recapture === 0) out.push({ kind: 'freePiece', text: `captures a free ${PIECE_NAME[m.captured]}`, squares: [m.to] });
    else if (net >= 1) out.push({ kind: 'winsMaterial', text: `wins material on ${m.to}`, squares: [m.to] });
    else if (net === 0) {
      const text =
        m.piece === m.captured || PIECE_VALUE[m.piece] !== capValue
          ? `trades off the ${PIECE_NAME[m.captured]} on ${m.to}`
          : `trades your ${name} for the ${PIECE_NAME[m.captured]} on ${m.to}`;
      out.push({ kind: 'trade', text, squares: [m.to] });
    }
  }

  const movedSafe = see(chess, m.to) === 0;

  // Fork / double attack: the moved piece hits two or more valuable or loose targets.
  if (m.piece !== 'k' && movedSafe) {
    const forkTargets: Placed[] = [];
    const looseTargets: Placed[] = [];
    const us = flipTurn(chess);
    for (const sq of attacksFrom(chess, m.to)) {
      const p = pieceAt(board, sq);
      if (!p || p.color !== them) continue;
      const winnable = p.type !== 'k' && us ? see(us, sq) > 0 : false;
      if (p.type === 'k' || value(p.type) > value(m.piece) || (winnable && p.type !== 'p')) forkTargets.push(p);
      else if (winnable) looseTargets.push(p);
    }
    if (forkTargets.length >= 2) {
      out.push({
        kind: 'fork',
        text: `forks the ${listNames(forkTargets)}`,
        squares: [m.to, ...forkTargets.map((t) => t.square)],
      });
    } else if (forkTargets.length + looseTargets.length >= 1 && !givesCheck) {
      const all = [...forkTargets, ...looseTargets];
      const desc =
        all.length === 1
          ? `the ${PIECE_NAME[all[0].type]} on ${all[0].square}`
          : all.every((t) => t.type === all[0].type)
            ? `the ${plural(all[0].type)} on ${all.map((t) => t.square).join(' and ')}`
            : all.map((t) => `the ${PIECE_NAME[t.type]} on ${t.square}`).join(' and ');
      // Hitting two loose targets at once is a double attack: one of them usually falls.
      if (all.length >= 2 && forkTargets.length >= 1)
        out.push({ kind: 'fork', text: `makes a double attack on ${desc}`, squares: [m.to, ...all.map((t) => t.square)] });
      else out.push({ kind: 'attacks', text: `attacks ${desc}`, squares: [m.to, ...all.map((t) => t.square)] });
    }
  }

  // Pins and skewers created by the moved slider.
  for (const [df, dr] of sliderDirs(m.promotion ?? m.piece)) {
    const [a, b] = rayPieces(board, m.to, df, dr);
    if (!a || !b || a.color !== them || b.color !== them) continue;
    if ((b.type === 'k' || value(b.type) > value(a.type)) && a.type !== 'p' && a.type !== 'k') {
      out.push({ kind: 'pin', text: `pins the ${PIECE_NAME[a.type]} to ${article(b.type)}`, squares: [m.to, a.square, b.square] });
    } else if ((a.type === 'k' || value(a.type) > value(b.type)) && b.type !== 'p' && !chess.isAttacked(b.square, them)) {
      out.push({ kind: 'skewer', text: `skewers ${article(a.type)} and the ${PIECE_NAME[b.type]} behind it`, squares: [m.to, a.square, b.square] });
    }
  }

  // Discovered attacks: one of our sliders now sees through the vacated square.
  for (const row of board) {
    for (const p of row) {
      if (!p || p.color !== me || p.square === m.to) continue;
      for (const [df, dr] of sliderDirs(p.type)) {
        const hit = rayPieces(board, p.square, df, dr, 1)[0];
        const beforeRay = rayPieces(beforeBoard, p.square, df, dr, 1);
        if (!hit || hit.color !== them || beforeRay[0]?.square !== m.from) continue;
        if (hit.type === 'k') out.push({ kind: 'discoveredCheck', text: 'gives a discovered check', squares: [p.square, hit.square] });
        else if (hit.type !== 'p' && (value(hit.type) > value(p.type) || !chess.isAttacked(hit.square, them)))
          out.push({ kind: 'discovered', text: `unleashes a discovered attack on the ${PIECE_NAME[hit.type]}`, squares: [p.square, hit.square] });
      }
    }
  }

  if (givesCheck && !out.some((o) => o.kind === 'discoveredCheck' || o.kind === 'fork')) {
    if (out.length) out[out.length - 1] = { ...out[out.length - 1], text: `${out[out.length - 1].text} with check` };
    else out.push({ kind: 'check', text: 'gives check' });
  }

  // Threatens mate next move?
  if (!givesCheck) {
    const flipped = flipTurn(chess);
    if (flipped) {
      for (const mv of flipped.moves({ verbose: true })) {
        flipped.move(mv);
        const mate = flipped.isCheckmate();
        flipped.undo();
        if (mate) {
          out.push({ kind: 'threatensMate', text: `threatens checkmate with ${mv.san}`, squares: [mv.from, mv.to] });
          break;
        }
      }
    }
  }

  // Defends a piece that was hanging.
  if (hangingBefore.length) {
    const hangingAfter = new Set(hangingPieces(chess, me).map((h) => h.square));
    const saved = hangingBefore.filter((h) => !hangingAfter.has(h.square) && h.square !== m.from);
    const escaped = hangingBefore.some((h) => h.square === m.from) && !hangingAfter.has(m.to);
    if (escaped) out.push({ kind: 'escapes', text: `moves the ${name} out of danger` });
    else if (saved.length && !m.captured) out.push({ kind: 'defends', text: `defends the ${PIECE_NAME[saved[0].type]} on ${saved[0].square}` });
  }

  // Quiet positional ideas (only reported when nothing sharper happened).
  if (!out.length) {
    const backRank = me === 'w' ? '1' : '8';
    if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === backRank) {
      out.push({ kind: 'develops', text: `develops the ${name}` });
    } else if (m.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5', 'f4', 'f5'].includes(m.to) && chess.moveNumber() <= 15) {
      out.push({ kind: 'centre', text: 'fights for the centre' });
    }
  }
  return out.sort((a, b) => MOTIF_PRIORITY.indexOf(a.kind) - MOTIF_PRIORITY.indexOf(b.kind));
}

const MOTIF_PRIORITY: MotifKind[] = [
  'mate',
  'threatensMate',
  'fork',
  'discoveredCheck',
  'skewer',
  'pin',
  'discovered',
  'winsMaterial',
  'freePiece',
  'promotion',
  'recapture',
  'attacks',
  'castle',
  'escapes',
  'defends',
  'develops',
  'centre',
  'trade',
  'check',
];

export interface MaterialOutcome {
  /** Material change for `color` over the line (positive = gained). */
  delta: number;
  /** Plies that were actually examined. */
  plies: number;
  lostPieces: PieceSymbol[];
  wonPieces: PieceSymbol[];
  mate: boolean;
}

/**
 * Plays a principal variation and reports the material swing for `color`,
 * stopping at a quiet point so a half-finished exchange is not misreported.
 */
export function lineMaterial(fen: string, pv: string[], color: Color, maxPlies = 10): MaterialOutcome {
  const chess = new Chess(fen);
  const start = materialBalance(chess, color);
  let best = { delta: 0, plies: 0, lost: [] as PieceSymbol[], won: [] as PieceSymbol[] };
  const lost: PieceSymbol[] = [];
  const won: PieceSymbol[] = [];
  let mate = false;
  const moves: Move[] = [];
  for (let i = 0; i < Math.min(pv.length, maxPlies); i++) {
    const m = playUci(chess, pv[i]);
    if (!m) break;
    moves.push(m);
    if (m.captured) (m.color === color ? won : lost).push(m.captured);
    if (chess.isCheckmate()) {
      mate = true;
      best = { delta: materialBalance(chess, color) - start, plies: i + 1, lost: [...lost], won: [...won] };
      break;
    }
    const next = pv[i + 1];
    const nextIsCapture = next ? !!chess.get(next.slice(2, 4) as Square) || next.length === 5 : false;
    if (!nextIsCapture && !chess.inCheck()) {
      best = { delta: materialBalance(chess, color) - start, plies: i + 1, lost: [...lost], won: [...won] };
    }
  }
  return { delta: best.delta, plies: best.plies, lostPieces: best.lost, wonPieces: best.won, mate };
}

export function describeMaterial(delta: number, won: PieceSymbol[], lost: PieceSymbol[]): string {
  const net = (list: PieceSymbol[], minus: PieceSymbol[]) => {
    const counts = new Map<PieceSymbol, number>();
    for (const p of list) counts.set(p, (counts.get(p) ?? 0) + 1);
    for (const p of minus) if (counts.get(p)) counts.set(p, counts.get(p)! - 1);
    return [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => PIECE_VALUE[b[0]] - PIECE_VALUE[a[0]]);
  };
  const gains = net(won, lost);
  const losses = net(lost, won);
  const top = (delta > 0 ? gains : losses)[0];
  const opposite = (delta > 0 ? losses : gains)[0];
  const abs = Math.abs(delta);
  if (top) {
    const [piece] = top;
    if (piece === 'r' && opposite && (opposite[0] === 'n' || opposite[0] === 'b')) return 'the exchange';
    if (piece === 'q' && opposite) return `the queen for a ${PIECE_NAME[opposite[0]]}`;
    if (abs <= 1 && piece !== 'p') return 'a pawn';
    return `a ${PIECE_NAME[piece]}`;
  }
  if (abs >= 9) return 'a queen’s worth of material';
  if (abs >= 5) return 'a rook’s worth of material';
  if (abs >= 3) return 'a piece';
  if (abs >= 2) return 'two pawns';
  return 'a pawn';
}

export interface Sacrifice {
  /** Net material offered (0 when nothing is really given up). */
  amount: number;
  /** The moved piece itself is the one en prise. */
  movedPiece: boolean;
  /** Type and square of the piece on offer. */
  piece?: PieceSymbol;
  square?: Square;
}

/**
 * Net material a move offers, assuming the opponent takes the most valuable
 * thing on offer. Material that was already lost before the move (e.g. the
 * other half of a fork) is not counted as a sacrifice.
 */
export function sacrificeAmount(fenBefore: string, uci: string): Sacrifice {
  const chess = new Chess(fenBefore);
  const me = chess.turn();
  const before = hangingPieces(chess, me);
  const m = playUci(chess, uci);
  if (!m || chess.isCheckmate() || m.piece === 'k') return { amount: 0, movedPiece: false };
  const gained = (m.captured ? PIECE_VALUE[m.captured] : 0) + (m.promotion ? PIECE_VALUE[m.promotion] - 1 : 0);
  const movedWasHanging = before.some((h) => h.square === m.from);
  const beforeLoss = new Map(before.map((h) => [h.square, h.loss]));
  let amount = 0;
  let movedPiece = false;
  let piece: PieceSymbol | undefined;
  let square: Square | undefined;
  for (const h of hangingPieces(chess, me)) {
    const isMoved = h.square === m.to;
    const isNew = (beforeLoss.get(h.square) ?? 0) < h.loss;
    if (!isMoved && !isNew && movedWasHanging) continue;
    const net = h.loss - gained;
    if (net > amount) {
      amount = net;
      movedPiece = isMoved;
      piece = h.type;
      square = h.square;
    }
  }
  return { amount: Math.max(0, amount), movedPiece, piece, square };
}
