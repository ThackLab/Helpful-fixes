// Optional AI coach: a conversational chess coach powered by Claude, grounded
// in the Stockfish review so it explains the engine's verdicts instead of
// guessing. Uses the user's own Anthropic API key, sent straight from the
// browser to the Anthropic API (nothing goes through a server of ours).
import Anthropic from '@anthropic-ai/sdk';
import { formatScore } from '../engine/uci';
import { formatLine } from '../chess/utils';
import { CLASS_META, type GameReview } from '../review/types';
import type { GameRecord } from '../storage/db';

export const COACH_MODEL = 'claude-opus-5-5';

const SYSTEM_PROMPT = `You are a friendly, expert chess coach reviewing one of your student's games inside a chess app.

You are given the game together with a full Stockfish 18 analysis: the evaluation after every move, the engine's best move and line, and a move classification (brilliant, great, best, excellent, good, book, inaccuracy, mistake, miss, blunder) with a short automatic comment. Treat the engine data as ground truth for what is objectively best; your job is to explain the *why* in human terms - plans, pawn structure, piece activity, king safety, tactics and practical decision-making - at a level that suits the student's rating.

Guidelines:
- Be concrete: name squares, pieces and short move sequences in standard algebraic notation.
- Never invent variations that contradict the engine lines you were given. If you need a line the data doesn't contain, say it is a rough idea rather than a calculated line.
- Prefer one or two key lessons over long lists. Keep answers short (roughly 80-200 words) unless asked for more detail.
- When the student asks about "this move" or "this position", use the position they are looking at, which is given in their message.
- Evaluations are in pawns from White's point of view (+1.00 = White is a pawn better; M3 = mate in 3).
- Use plain prose with occasional short bullet lists; no tables or headings.`;

export interface CoachMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Compact, stable description of the game and its review (cached across the chat). */
export function gameContext(game: GameRecord, review: GameReview): string {
  const lines: string[] = [];
  const who = (c: 'w' | 'b') => {
    const p = c === 'w' ? game.white : game.black;
    return `${p.name}${p.elo ? ` (${p.elo})` : ''}${game.userColor === c ? ' - the student' : ''}`;
  };
  lines.push(`White: ${who('w')}`);
  lines.push(`Black: ${who('b')}`);
  lines.push(`Result: ${game.result}${game.termination ? ` (${game.termination})` : ''}`);
  if (review.opening) lines.push(`Opening: ${review.opening.eco} ${review.opening.name}`);
  if (game.startFen.split(' ')[0] !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR') lines.push(`Start position (FEN): ${game.startFen}`);
  lines.push(
    `Accuracy: White ${review.white.accuracy.toFixed(1)}%, Black ${review.black.accuracy.toFixed(1)}%. Estimated performance: White ${review.white.estimatedRating}, Black ${review.black.estimatedRating}.`,
  );
  lines.push('');
  lines.push('Moves (move | classification | eval after | engine best and line when different | automatic comment):');
  for (const m of review.moves) {
    const no = `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '...'}`;
    const parts = [`${no} ${m.san}`, CLASS_META[m.classification].label, formatScore(m.scoreAfter)];
    if (m.bestSan && m.bestMove !== m.uci && !['book', 'forced'].includes(m.classification)) {
      parts.push(`best ${m.bestSan}: ${formatLine(m.fenBefore, m.bestLine.slice(0, 6))}`);
    }
    if (['inaccuracy', 'mistake', 'miss', 'blunder', 'brilliant', 'great'].includes(m.classification)) parts.push(m.comment);
    lines.push(parts.join(' | '));
  }
  lines.push('');
  lines.push(`Automatic summary: ${review.summary}`);
  return lines.join('\n');
}

/** Describes what the student is looking at right now. */
export function focusNote(review: GameReview, ply: number): string {
  if (ply < 0) return 'I am looking at the game overview.';
  const m = review.moves[ply];
  if (!m) return '';
  const no = `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '...'}`;
  const pos = review.positions[ply + 1];
  const best = pos?.lines[0];
  return [
    `I am looking at ${no} ${m.san} (${CLASS_META[m.classification].label}).`,
    `Position after the move (FEN): ${m.fenAfter}`,
    best ? `Engine's best continuation from here: ${formatLine(m.fenAfter, best.san.slice(0, 8))} (${formatScore(best.score)}).` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export class CoachError extends Error {}

function friendlyError(e: unknown): CoachError {
  if (e instanceof Anthropic.AuthenticationError) return new CoachError('Your Anthropic API key was rejected. Check it in Settings.');
  if (e instanceof Anthropic.PermissionDeniedError) return new CoachError('This API key is not allowed to use the coach model.');
  if (e instanceof Anthropic.RateLimitError) return new CoachError('Rate limited by the Anthropic API - wait a moment and try again.');
  if (e instanceof Anthropic.APIConnectionError) return new CoachError('Could not reach the Anthropic API. Are you online?');
  if (e instanceof Anthropic.APIError) return new CoachError(`Anthropic API error ${e.status ?? ''}: ${e.message}`);
  return new CoachError(e instanceof Error ? e.message : String(e));
}

export interface AskOptions {
  apiKey: string;
  context: string;
  history: CoachMessage[];
  question: string;
  onText: (delta: string) => void;
  signal?: AbortSignal;
}

/** Streams the coach's answer; resolves with the full text. */
export async function askCoach(o: AskOptions): Promise<string> {
  const client = new Anthropic({ apiKey: o.apiKey, dangerouslyAllowBrowser: true });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...o.history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: o.question },
  ];
  try {
    const stream = client.beta.messages.stream({
      model: COACH_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // Retry on a fallback model if a safety classifier declines the request.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        // The game data is identical for every question about this game, so cache it.
        { type: 'text', text: `The game and its engine review:\n\n${o.context}`, cache_control: { type: 'ephemeral' } },
      ],
      messages,
    });
    const onAbort = () => stream.abort();
    o.signal?.addEventListener('abort', onAbort);
    let text = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        o.onText(event.delta.text);
      }
    }
    o.signal?.removeEventListener('abort', onAbort);
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new CoachError('The coach declined to answer that question.');
    return text;
  } catch (e) {
    if (e instanceof CoachError) throw e;
    if (o.signal?.aborted) return '';
    throw friendlyError(e);
  }
}
