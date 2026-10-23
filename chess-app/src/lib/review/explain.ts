// The "coach": turns engine numbers into plain-English explanations by
// replaying the engine's lines and recognising common tactical patterns.
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { TACTICAL, describeMaterial, hangingPieces, lineMaterial, motifSentence, moveMotifs, type Motif } from '../chess/tactics';
import { PIECE_NAME, formatLine, playUci } from '../chess/utils';
import type { Score } from '../engine/uci';
import { evalScore } from './classify';
import type { Classification, PositionEval } from './types';

export interface ExplainInput {
  classification: Classification;
  color: Color;
  san: string;
  uci: string;
  before: PositionEval;
  after: PositionEval;
  epBefore: number;
  epAfter: number;
  epSecond?: number;
  sacrifice: number;
  sacrificePiece?: PieceSymbol;
  sacrificeSquare?: string;
  isBook?: boolean;
  opening?: string;
  /** Square of the opponent's last capture, if it was one. */
  recaptureSquare?: string;
  opponentClassification?: Classification;
}

export interface Explanation {
  headline: string;
  comment: string;
  tags: string[];
  squares: string[];
}

export function standing(ep: number): string {
  if (ep >= 0.97) return 'completely winning';
  if (ep >= 0.85) return 'winning';
  if (ep >= 0.68) return 'clearly better';
  if (ep >= 0.57) return 'slightly better';
  if (ep > 0.43) return 'about equal';
  if (ep > 0.32) return 'slightly worse';
  if (ep > 0.15) return 'clearly worse';
  if (ep > 0.03) return 'losing';
  return 'completely lost';
}

const isMateFor = (s: Score, color: Color) => s.type === 'mate' && (color === 'w' ? s.value > 0 : s.value < 0);
const isMateAgainst = (s: Score, color: Color) => s.type === 'mate' && (color === 'w' ? s.value < 0 : s.value > 0);
const mateIn = (s: Score) => Math.ceil(Math.abs(s.value));

function lineText(p: PositionEval, max = 6): string {
  const l = p.lines[0];
  if (!l) return '';
  return formatLine(p.fen, l.san.slice(0, max));
}

/** Our move followed by the engine's reply line, numbered from the position before our move. */
function continuation(before: PositionEval, san: string, after: PositionEval, max: number): string {
  return formatLine(before.fen, [san, ...(after.lines[0]?.san ?? [])].slice(0, max));
}

/** What the engine's best move achieves, as a verb phrase: "wins a knight", "forces checkmate in 3". */
function bestMoveIdea(p: PositionEval, color: Color, recaptureSquare?: string): string {
  const best = p.lines[0];
  if (!best || !best.pv.length) return '';
  if (isMateFor(best.score, color)) {
    const n = mateIn(best.score);
    return n === 1 ? 'is checkmate' : `forces checkmate in ${n} (${lineText(p, n * 2 - 1)})`;
  }
  const motifs = moveMotifs(p.fen, best.pv[0], recaptureSquare);
  const mat = lineMaterial(p.fen, best.pv, color, 10);
  const key = motifs.find((m) => TACTICAL.includes(m.kind));
  if (mat.delta >= 1) {
    const what = describeMaterial(mat.delta, mat.wonPieces, mat.lostPieces);
    return key ? `${key.text} and wins ${what}` : `wins ${what}`;
  }
  if (key) return key.text;
  const first = motifs.find((m) => m.kind !== 'check' && m.kind !== 'trade');
  return first?.text ?? '';
}

/** Why a move is bad: what the opponent's best reply does to us. */
function punishment(input: ExplainInput): { text: string; squares: string[]; tags: string[] } {
  const { before, after, color, uci } = input;
  const reply = after.lines[0];
  const s = evalScore(after);
  if (!reply || !reply.pv.length) return { text: '', squares: [], tags: [] };
  const replySan = reply.san[0];
  if (isMateAgainst(s, color) && !isMateAgainst(evalScore(before), color)) {
    const n = mateIn(s);
    return {
      text: n === 1 ? `This allows ${replySan}, which is checkmate.` : `This allows a forced checkmate in ${n}: ${lineText(after, n * 2 - 1)}.`,
      squares: [reply.pv[0].slice(0, 2), reply.pv[0].slice(2, 4)],
      tags: ['allowsMate'],
    };
  }
  // Material over our move + the reply line, so trades are not mistaken for losses.
  const mat = lineMaterial(before.fen, [uci, ...reply.pv], color, 11);
  const replyMotifs = moveMotifs(after.fen, reply.pv[0], input.san.includes('x') ? uci.slice(2, 4) : undefined);
  const tactic = replyMotifs.find((m) => TACTICAL.includes(m.kind) && m.kind !== 'threatensMate');
  if (mat.delta <= -1) {
    const what = describeMaterial(-mat.delta, mat.lostPieces, mat.wonPieces);
    const hanging = hangingPieces(new Chess(after.fen), color);
    const hung = hanging.find((h) => h.square === reply.pv[0].slice(2, 4));
    if (hung && !tactic) {
      const moved = uci.slice(2, 4) === hung.square;
      const piece = PIECE_NAME[hung.type];
      return {
        text: moved
          ? `Your ${piece} on ${hung.square} can simply be taken: ${replySan} wins ${what}.`
          : `This leaves your ${piece} on ${hung.square} ${hung.undefended ? 'undefended' : 'under-protected'}, and ${replySan} wins ${what}.`,
        squares: [hung.square],
        tags: ['hangs'],
      };
    }
    if (tactic) {
      return {
        text: `This allows ${replySan}, which ${tactic.text} - you lose ${what}.`,
        squares: tactic.squares ?? [],
        tags: [tactic.kind, 'losesMaterial'],
      };
    }
    return {
      text: `Your opponent wins ${what} after ${lineText(after, Math.min(10, Math.max(4, mat.plies - 1)))}.`,
      squares: [reply.pv[0].slice(2, 4)],
      tags: ['losesMaterial'],
    };
  }
  if (tactic) return { text: `It allows ${replySan}, which ${tactic.text}.`, squares: tactic.squares ?? [], tags: [tactic.kind] };
  if (replyMotifs.some((m) => m.kind === 'threatensMate'))
    return { text: `Your opponent gets a dangerous attack with ${replySan}.`, squares: [], tags: ['attack'] };
  return { text: '', squares: [], tags: [] };
}

function evalShift(epBefore: number, epAfter: number): string {
  const a = standing(epBefore);
  const b = standing(epAfter);
  if (a === b) return `You are still ${b}, but this makes your task harder.`;
  if (epBefore >= 0.57 && epAfter < 0.57 && epAfter > 0.43) return 'Your advantage slips away and the position is now about equal.';
  return `The position goes from ${a} to ${b}.`;
}

function sacrificeName(amount: number, piece?: PieceSymbol): string {
  if (piece === 'q') return 'your queen';
  if (piece === 'r') return amount <= 2 ? 'the exchange' : 'a rook';
  if (piece === 'n' || piece === 'b') return `a ${PIECE_NAME[piece]}`;
  return amount >= 3 ? 'a piece' : 'material';
}

export function explainMove(input: ExplainInput): Explanation {
  const { classification: cls, san, color, before, after } = input;
  const best = before.lines[0]?.san[0] ?? null;
  const played: Motif[] = moveMotifs(before.fen, input.uci, input.recaptureSquare);
  const playedMain = played.find((m) => m.kind !== 'check') ?? played[0];
  const tags = played.map((m) => m.kind as string);

  switch (cls) {
    case 'book':
      return {
        headline: `${san} is a book move`,
        comment: input.opening ? `${input.opening}. A well-known opening move.` : 'A well-known opening move.',
        tags: ['book'],
        squares: [],
      };
    case 'forced':
      return { headline: `${san} is forced`, comment: 'This was the only legal move.', tags, squares: [] };
    case 'brilliant': {
      const reply = after.lines[0];
      const s = evalScore(after);
      const offer = sacrificeName(input.sacrifice, input.sacrificePiece);
      const accepted = !!reply?.pv[0] && reply.pv[0].slice(2, 4) === input.sacrificeSquare;
      let why: string;
      if (isMateFor(s, color)) why = `but it forces checkmate: ${continuation(before, san, after, mateIn(s) * 2 + 1)}.`;
      else if (!accepted) why = `but your opponent cannot accept it safely. The engine's line: ${continuation(before, san, after, 6)}.`;
      else why = `but taking it costs your opponent even more: ${continuation(before, san, after, 6)}.`;
      const extra =
        playedMain && !['freePiece', 'trade', 'check', 'recapture', 'winsMaterial'].includes(playedMain.kind) ? ` It ${playedMain.text}.` : '';
      return {
        headline: `${san} is brilliant!`,
        comment: `A sound sacrifice: you offer ${offer}${input.sacrificeSquare ? ` on ${input.sacrificeSquare}` : ''}, ${why}${extra}`,
        tags: [...tags, 'sacrifice'],
        squares: input.sacrificeSquare ? [input.sacrificeSquare] : [input.uci.slice(2, 4)],
      };
    }
    case 'great': {
      const second = before.lines[1];
      const now = standing(input.epAfter);
      const keep = input.epAfter >= 0.57 ? `keeps you ${now}` : input.epAfter > 0.43 ? 'holds the balance' : 'keeps you fighting';
      const alt = second?.san[0] ? ` The next best try, ${second.san[0]}, would leave you ${standing(input.epSecond ?? 0.5)}.` : '';
      const punish =
        input.opponentClassification && ['mistake', 'blunder', 'inaccuracy', 'miss'].includes(input.opponentClassification)
          ? ' It punishes your opponent’s mistake.'
          : '';
      return {
        headline: `${san} is a great move`,
        comment: `The only move that ${keep}.${alt}${punish}${playedMain ? ' ' + motifSentence(playedMain) : ''}`,
        tags,
        squares: [],
      };
    }
    case 'best':
    case 'excellent':
    case 'good': {
      const verdict = cls === 'best' ? 'is the best move' : cls === 'excellent' ? 'is excellent' : 'is good';
      const parts: string[] = [];
      if (playedMain) parts.push(motifSentence(playedMain));
      if (cls !== 'best' && best && best !== san) {
        const idea = bestMoveIdea(before, color, input.recaptureSquare);
        parts.push(`${best} was ${cls === 'good' ? 'stronger' : 'slightly more precise'}${idea ? ` - it ${idea}` : ''}.`);
      }
      if (!parts.length) parts.push(cls === 'best' ? 'The engine’s top choice.' : 'A solid, reasonable move.');
      return { headline: `${san} ${verdict}`, comment: parts.join(' '), tags, squares: [] };
    }
    case 'miss': {
      const idea = bestMoveIdea(before, color, input.recaptureSquare);
      const parts = [best ? `You missed ${best}, which ${idea || 'kept a big advantage'}.` : 'You missed a strong continuation.'];
      if (input.opponentClassification && ['mistake', 'blunder'].includes(input.opponentClassification))
        parts.push('Your opponent had just slipped - always look for checks, captures and threats after their move.');
      const pv = before.lines[0]?.pv[0];
      return {
        headline: `${san} is a miss`,
        comment: parts.join(' '),
        tags: [...tags, 'missedTactic'],
        squares: pv ? [pv.slice(0, 2), pv.slice(2, 4)] : [],
      };
    }
    case 'inaccuracy':
    case 'mistake':
    case 'blunder': {
      const verdict = cls === 'inaccuracy' ? 'is an inaccuracy' : cls === 'mistake' ? 'is a mistake' : 'is a blunder';
      const why = punishment(input);
      const idea = bestMoveIdea(before, color, input.recaptureSquare);
      const parts: string[] = [];
      if (input.isBook) parts.push('This is a known opening line, but the engine does not trust it.');
      parts.push(why.text || evalShift(input.epBefore, input.epAfter));
      if (best) parts.push(`Best was ${best}${idea ? `, which ${idea}` : ''}.`);
      return { headline: `${san} ${verdict}`, comment: parts.join(' '), tags: [...tags, ...why.tags], squares: why.squares };
    }
  }
}

/** The opponent's threat in a position (what they would play if it were their move). */
export function describeThreat(fen: string, threatLine: string[]): string {
  if (!threatLine.length) return '';
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const flippedFen = parts.join(' ');
  let flipped: Chess;
  try {
    flipped = new Chess(flippedFen);
  } catch {
    return '';
  }
  const m = playUci(flipped, threatLine[0]);
  if (!m) return '';
  if (flipped.isCheckmate()) return `${m.san} is checkmate`;
  const mat = lineMaterial(flippedFen, threatLine, parts[1] as Color, 6);
  if (mat.delta >= 1) return `${m.san}, winning ${describeMaterial(mat.delta, mat.wonPieces, mat.lostPieces)}`;
  return m.san;
}
