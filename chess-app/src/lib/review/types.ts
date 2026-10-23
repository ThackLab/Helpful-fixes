import type { Color } from 'chess.js';
import type { Score } from '../engine/uci';

export type Classification =
  'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'forced' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';

export const CLASS_ORDER: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export interface ClassMeta {
  label: string;
  symbol: string;
  color: string;
  /** Short verdict used in the coach bubble, e.g. "is a blunder". */
  verdict: string;
}

export const CLASS_META: Record<Classification, ClassMeta> = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#26c2a3', verdict: 'is brilliant' },
  great: { label: 'Great', symbol: '!', color: '#749bbf', verdict: 'is a great move' },
  best: { label: 'Best', symbol: '★', color: '#81b64c', verdict: 'is best' },
  excellent: { label: 'Excellent', symbol: '👍', color: '#81b64c', verdict: 'is excellent' },
  good: { label: 'Good', symbol: '✓', color: '#77915f', verdict: 'is good' },
  book: { label: 'Book', symbol: '📖', color: '#a88865', verdict: 'is a book move' },
  forced: { label: 'Forced', symbol: '→', color: '#97af8b', verdict: 'is forced' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c631', verdict: 'is an inaccuracy' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ffa459', verdict: 'is a mistake' },
  miss: { label: 'Miss', symbol: '✗', color: '#ff7769', verdict: 'is a miss' },
  blunder: { label: 'Blunder', symbol: '??', color: '#fa412d', verdict: 'is a blunder' },
};

export interface EngineLine {
  score: Score;
  /** UCI moves. */
  pv: string[];
  san: string[];
  depth: number;
}

export interface PositionEval {
  fen: string;
  /** Best lines (MultiPV) ordered best first, scores from White's perspective. */
  lines: EngineLine[];
  depth: number;
  /** Terminal position result if the game is over here. */
  terminal?: 'checkmate' | 'stalemate' | 'draw';
}

export type Phase = 'opening' | 'middlegame' | 'endgame';

export interface ReviewedMove {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  classification: Classification;
  /** Expected points (0..1) for the mover before (best play) and after the move. */
  epBefore: number;
  epAfter: number;
  epLoss: number;
  /** Win% from White's perspective after the move (lichess scale). */
  winAfter: number;
  accuracy: number;
  cpLoss: number;
  scoreAfter: Score;
  bestMove: string | null;
  bestSan: string | null;
  bestLine: string[];
  /** Opponent's best reply line after the move was played. */
  replyLine: string[];
  phase: Phase;
  opening?: string;
  /** Short headline, e.g. "Nf3 is best". */
  headline: string;
  /** Coach explanation (1-3 sentences). */
  comment: string;
  /** Tactical motif tags detected for the played move and the best move. */
  tags: string[];
  /** Key squares for highlighting the idea on the board. */
  squares?: string[];
}

export interface PlayerSummary {
  accuracy: number;
  acpl: number;
  estimatedRating: number;
  counts: Record<Classification, number>;
  phases: Record<Phase, number | null>;
}

export interface GameReview {
  version: number;
  depth: number;
  createdAt: number;
  startFen: string;
  positions: PositionEval[];
  moves: ReviewedMove[];
  white: PlayerSummary;
  black: PlayerSummary;
  opening?: { eco: string; name: string };
  /** Plies where the evaluation swung the most. */
  keyMoments: number[];
  summary: string;
}

export const REVIEW_VERSION = 3;
