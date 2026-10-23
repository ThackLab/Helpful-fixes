import { useEffect, useRef, useState } from 'react';
import type { GameReview } from '../lib/review/types';
import type { GameRecord } from '../lib/storage/db';
import type { CoachMessage } from '../lib/coach/aiCoach';
import { useSettings } from '../state/settings';

const SUGGESTIONS = [
  'Why is this move good or bad?',
  'What should the plan be in this position?',
  'What were my biggest weaknesses this game?',
  'Explain the ideas behind this opening.',
];

/** Chat with the optional Claude-powered coach about the reviewed game. */
export function AiCoachChat({ game, review, ply }: { game: GameRecord; review: GameReview; ply: number }) {
  const apiKey = useSettings((s) => s.aiCoachKey);
  const [history, setHistory] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'nearest' }), [history, streaming]);

  if (!apiKey) {
    return (
      <div className="card" style={{ background: 'var(--panel-2)', padding: 12, fontSize: '0.88rem' }}>
        <b>💬 AI coach (optional)</b>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Ask follow-up questions about any move in plain English, answered by Claude using this Stockfish review. Add your own Anthropic API key in{' '}
          <a href="#/settings">Settings</a> to turn it on.
        </p>
      </div>
    );
  }

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || streaming !== null) return;
    setError(null);
    setDraft('');
    const { askCoach, focusNote, gameContext } = await import('../lib/coach/aiCoach');
    const full = `${focusNote(review, ply)}\n\n${q}`;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming('');
    try {
      const answer = await askCoach({
        apiKey,
        context: gameContext(game, review),
        history,
        question: full,
        signal: ctrl.signal,
        onText: (d) => setStreaming((s) => (s ?? '') + d),
      });
      if (answer) setHistory((h) => [...h, { role: 'user', text: full }, { role: 'assistant', text: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(null);
      abort.current = null;
    }
  };

  const shownQuestion = (t: string) => t.split('\n\n').slice(1).join('\n\n') || t;

  return (
    <div className="card" style={{ background: 'var(--panel-2)', padding: 12 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <b>💬 Ask the coach</b>
        <span className="spacer" />
        {history.length > 0 && (
          <button className="btn ghost small" onClick={() => setHistory([])}>
            Clear
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8, fontSize: '0.9rem' }}>
        {history.map((m, i) => (
          <div key={i} style={m.role === 'user' ? { color: 'var(--text-dim)', fontStyle: 'italic' } : { whiteSpace: 'pre-wrap' }}>
            {m.role === 'user' ? `You: ${shownQuestion(m.text)}` : m.text}
          </div>
        ))}
        {streaming !== null && <div style={{ whiteSpace: 'pre-wrap' }}>{streaming || <span className="faint">Thinking…</span>}</div>}
        {error && <div className="error-box">{error}</div>}
        <div ref={endRef} />
      </div>
      {!history.length && streaming === null && (
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn small ghost" style={{ background: '#ffffff0d' }} onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="row"
        style={{ marginTop: 8, flexWrap: 'nowrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          style={{ flex: 1, minWidth: 0 }}
          placeholder="Ask about this move or the game…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {streaming !== null ? (
          <button type="button" className="btn small" onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button className="btn small primary" disabled={!draft.trim()}>
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
