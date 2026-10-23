import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board, type PromotionPiece } from '../components/Board';
import { ClassIcon, boardBadge } from '../components/ClassIcon';
import { MoveList } from '../components/MoveList';
import { AiCoachChat } from '../components/AiCoachChat';
import { EvalBar, EvalGraph, PlayerBar, ScoreChip, Segmented, type GraphPoint } from '../components/Widgets';
import { getAnalysisEngine } from '../lib/engine/manager';
import { formatLine, legalDests, moveToUci, playUci } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { evalScore } from '../lib/review/classify';
import { CLASS_META, CLASS_ORDER, type Classification, type GameReview, type Phase, type ReviewedMove } from '../lib/review/types';
import { expectedFor, scoreToExpected } from '../lib/review/winprob';
import { getGame, getReview, onDbChange, saveGame, savePuzzles, saveReview, type GameRecord } from '../lib/storage/db';
import { summariseGame } from '../lib/review/review';
import { puzzlesFrom, useReviewer } from '../state/reviewer';
import { findBot } from '../lib/bots/bots';
import type { Score } from '../lib/engine/uci';

const SUMMARY_CLASSES: Classification[] = CLASS_ORDER.filter((c) => c !== 'forced');
const BAD: Classification[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

function useGameAndReview(gameId: string) {
  const [game, setGame] = useState<GameRecord | null | undefined>(undefined);
  const [review, setReview] = useState<GameReview | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [g, r] = await Promise.all([getGame(gameId), getReview(gameId)]);
      if (!alive) return;
      setGame(g ?? null);
      setReview(r ?? null);
    };
    void load();
    const off = onDbChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [gameId]);
  return { game, review };
}

function PhaseBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="faint">–</span>;
  const cls: Classification =
    value >= 90 ? 'best' : value >= 80 ? 'excellent' : value >= 70 ? 'good' : value >= 60 ? 'inaccuracy' : value >= 50 ? 'mistake' : 'blunder';
  return <ClassIcon cls={cls} size={24} title={`${value.toFixed(0)}% accuracy`} />;
}

export function ReviewPage({ gameId }: { gameId: string }) {
  const { game, review } = useGameAndReview(gameId);
  const job = useReviewer((s) => s.jobs[gameId]);
  const [cur, setCur] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [showBest, setShowBest] = useState(true);
  const [line, setLine] = useState<{ base: string; moves: string[]; idx: number } | null>(null);
  const [retry, setRetry] = useState<{ ply: number; state: 'try' | 'correct' | 'wrong'; tried?: string; checking?: boolean } | null>(null);
  const [focus, setFocus] = useState<'w' | 'b' | null>(null);

  useEffect(() => {
    if (review === null && game) void useReviewer.getState().start(gameId);
  }, [review, game, gameId]);

  useEffect(() => {
    if (game?.userColor) {
      setFocus(game.userColor);
      setFlipped(game.userColor === 'b');
    }
  }, [game?.userColor]);

  const moves = review?.moves ?? [];
  const m: ReviewedMove | undefined = cur >= 0 ? moves[cur] : undefined;

  // Reset auxiliary modes whenever we move.
  useEffect(() => {
    setLine(null);
    setRetry(null);
  }, [cur]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') {
        if (line) setLine((l) => (l ? { ...l, idx: Math.min(l.moves.length, l.idx + 1) } : l));
        else setCur((c) => Math.min(moves.length - 1, c + 1));
      } else if (e.key === 'ArrowLeft') {
        if (line) setLine((l) => (l ? { ...l, idx: Math.max(0, l.idx - 1) } : l));
        else setCur((c) => Math.max(-1, c - 1));
      } else if (e.key === 'ArrowUp') setCur(-1);
      else if (e.key === 'ArrowDown') setCur(moves.length - 1);
      else if (e.key === 'f') setFlipped((f) => !f);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [moves.length, line]);

  const points: GraphPoint[] = useMemo(() => {
    if (review)
      return review.positions.map((p, i) => ({ value: scoreToExpected(evalScore(p)), cls: i > 0 ? review.moves[i - 1]?.classification : undefined }));
    if (job?.partial) {
      let last = 0.5;
      return job.partial.map((p) => {
        if (p) last = scoreToExpected(evalScore(p));
        return { value: last };
      });
    }
    return [];
  }, [review, job?.partial]);

  // ---------------------------------------------------------------- board state
  const board = useMemo(() => {
    if (!game) return null;
    if (retry && m) {
      const c = new Chess(m.fenBefore);
      const last = retry.tried;
      let fen = m.fenBefore;
      let lastMove: [string, string] | undefined = cur > 0 ? [moves[cur - 1].uci.slice(0, 2), moves[cur - 1].uci.slice(2, 4)] : undefined;
      if (last && retry.state !== 'try') {
        playUci(c, last);
        fen = c.fen();
        lastMove = [last.slice(0, 2), last.slice(2, 4)];
      }
      return { fen, lastMove, check: c.inCheck(), dests: retry.state === 'try' ? legalDests(c) : undefined, movable: retry.state === 'try' };
    }
    if (line) {
      const c = new Chess(line.base);
      let lastMove: [string, string] | undefined;
      for (const u of line.moves.slice(0, line.idx)) {
        playUci(c, u);
        lastMove = [u.slice(0, 2), u.slice(2, 4)];
      }
      return { fen: c.fen(), lastMove, check: c.inCheck(), movable: false };
    }
    const fen = m ? m.fenAfter : game.startFen;
    const c = new Chess(fen);
    return { fen, lastMove: m ? ([m.uci.slice(0, 2), m.uci.slice(2, 4)] as [string, string]) : undefined, check: c.inCheck(), movable: false };
  }, [game, m, cur, moves, line, retry]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (!m || retry || line) return [];
    const out: DrawShape[] = [{ orig: m.uci.slice(2, 4) as Key, customSvg: { html: boardBadge(m.classification) } }];
    if (showBest && m.bestMove && m.bestMove !== m.uci && !['book', 'forced', 'best', 'brilliant', 'great'].includes(m.classification)) {
      out.push({ orig: m.bestMove.slice(0, 2) as Key, dest: m.bestMove.slice(2, 4) as Key, brush: 'green' });
    }
    // Show the punishing reply for real mistakes.
    if (showBest && ['mistake', 'blunder'].includes(m.classification) && review) {
      const reply = review.positions[cur + 1]?.lines[0]?.pv[0];
      if (reply) out.push({ orig: reply.slice(0, 2) as Key, dest: reply.slice(2, 4) as Key, brush: 'red', modifiers: { lineWidth: 8 } });
    }
    return out;
  }, [m, showBest, retry, line, review, cur]);

  const highlights = useMemo(() => {
    if (!m || retry || line) return undefined;
    const h = new Map<string, string>();
    for (const sq of m.squares ?? []) if (sq !== m.uci.slice(2, 4)) h.set(sq, 'hl-key');
    return h.size ? h : undefined;
  }, [m, retry, line]);

  const currentScore: Score | undefined = useMemo(() => {
    if (!review) return undefined;
    if (line) return undefined;
    return evalScore(review.positions[cur + 1]);
  }, [review, cur, line]);

  // ---------------------------------------------------------------- retry
  const onRetryMove = async (from: string, to: string, promotion?: PromotionPiece) => {
    if (!m || !review || !retry) return;
    const c = new Chess(m.fenBefore);
    const mv = playUci(c, from + to + (promotion ?? ''));
    if (!mv) return;
    const uci = moveToUci(mv);
    playSound(soundForSan(mv.san));
    const before = review.positions[cur];
    const bestEp = expectedFor(evalScore(before), m.color);
    const known = before.lines.find((l) => l.pv[0] === uci);
    let ep: number | null = known ? expectedFor(known.score, m.color) : null;
    setRetry({ ...retry, tried: uci, state: 'try', checking: ep === null });
    if (ep === null) {
      const res = await getAnalysisEngine().analyse({ fen: c.fen(), limits: { depth: Math.min(review.depth, 16), movetime: 4000 } });
      ep = res.lines[0] ? expectedFor(res.lines[0].score, m.color) : 0;
    }
    const ok = uci === m.bestMove || bestEp - ep <= 0.02;
    playSound(ok ? 'correct' : 'wrong');
    setRetry({ ply: cur, tried: uci, state: ok ? 'correct' : 'wrong' });
  };

  const claimSide = async (c: 'w' | 'b') => {
    if (!game) return;
    await saveGame({ ...game, userColor: c, white: { ...game.white, isUser: c === 'w' }, black: { ...game.black, isUser: c === 'b' } });
    if (review) {
      await saveReview(gameId, { ...review, summary: summariseGame(review, c) });
      await savePuzzles(puzzlesFrom(review, gameId, c));
    }
    setFocus(c);
    setFlipped(c === 'b');
  };

  if (game === undefined) return <div className="page muted">Loading…</div>;
  if (game === null)
    return (
      <div className="page empty">
        <h2>Game not found</h2>
        <button className="btn" onClick={() => navigate('/games')}>
          Back to games
        </button>
      </div>
    );

  const orientation = flipped ? 'black' : 'white';
  const top = orientation === 'white' ? 'b' : 'w';
  const bottom = top === 'w' ? 'b' : 'w';
  const info = (c: 'w' | 'b') => (c === 'w' ? game.white : game.black);
  const summary = (c: 'w' | 'b') => (review ? (c === 'w' ? review.white : review.black) : null);
  const bar = (c: 'w' | 'b') => {
    const p = info(c);
    const s = summary(c);
    return (
      <PlayerBar
        avatar={p.isUser ? '🙂' : p.botId ? (findBot(p.botId)?.avatar ?? '🤖') : c === 'w' ? '♔' : '♚'}
        tint={p.isUser ? '#81b64c' : p.botId ? findBot(p.botId)?.tint : undefined}
        name={p.name}
        elo={p.elo}
        fen={board?.fen ?? game.startFen}
        startFen={game.startFen}
        color={c}
        clock={
          s ? (
            <div className={`acc-box ${c === 'b' ? 'dark' : ''}`} style={{ marginLeft: 'auto', fontSize: '1rem', minWidth: 60 }} title="Accuracy">
              {s.accuracy.toFixed(1)}
            </div>
          ) : undefined
        }
      />
    );
  };

  const running = job?.status === 'running';
  const progress = job ? job.done / Math.max(1, job.total) : 0;
  const retryable = m && BAD.includes(m.classification) && !!m.bestMove;

  const nextOf = (pred: (x: ReviewedMove) => boolean, dir = 1) => {
    for (let i = cur + dir; i >= 0 && i < moves.length; i += dir) if (pred(moves[i])) return i;
    return null;
  };
  const isFocusMistake = (x: ReviewedMove) => BAD.includes(x.classification) && (!focus || x.color === focus);
  const nextMistake = nextOf(isFocusMistake);

  return (
    <div className="game-layout">
      <div className="board-column with-evalbar">
        {bar(top)}
        <div className="board-row">
          <EvalBar score={currentScore} flipped={orientation === 'black'} />
          {board && (
            <Board
              fen={board.fen}
              orientation={orientation}
              lastMove={board.lastMove}
              check={board.check}
              shapes={shapes}
              highlights={highlights}
              movableColor={board.movable && m ? (m.color === 'w' ? 'white' : 'black') : undefined}
              dests={board.dests}
              onMove={onRetryMove}
              viewOnly={!board.movable}
            />
          )}
        </div>
        {bar(bottom)}
      </div>

      <div className="side-panel">
        <div className="panel-head">
          <span style={{ fontSize: 22 }}>⭐</span>
          <b style={{ fontSize: '1.1rem' }}>Game Review</b>
          <span className="spacer" />
          {review && (
            <span className="faint" style={{ fontSize: '0.8rem' }}>
              depth {review.depth}
            </span>
          )}
          <button className="icon-btn" title="Flip board (f)" onClick={() => setFlipped((f) => !f)}>
            ⇅
          </button>
        </div>

        <div className="panel-body">
          {running && (
            <div style={{ marginBottom: 14 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="muted">Stockfish is reviewing the game…</span>
                <span className="spacer" />
                <b>{Math.round(progress * 100)}%</b>
              </div>
              <div className="progress">
                <div style={{ width: `${progress * 100}%` }} />
              </div>
              <button className="btn small ghost" style={{ marginTop: 6 }} onClick={() => useReviewer.getState().cancel(gameId)}>
                Cancel
              </button>
            </div>
          )}
          {job?.status === 'error' && <div className="error-box">Review failed: {job.error}</div>}
          {review === null && !job && <div className="muted">Preparing review…</div>}

          {points.length > 1 && <EvalGraph points={points} current={cur + 1} onSelect={(i) => review && setCur(i - 1)} />}

          {review && cur === -1 && !game.userColor && (
            <div className="row card" style={{ marginTop: 12, padding: 10, background: 'var(--panel-2)' }}>
              <span className="muted" style={{ fontSize: '0.88rem' }}>
                Which side were you? (personalises the coach and adds your mistakes to Practice)
              </span>
              <button className="btn small" onClick={() => void claimSide('w')}>
                White
              </button>
              <button className="btn small" onClick={() => void claimSide('b')}>
                Black
              </button>
            </div>
          )}
          {review && cur === -1 && <Overview review={review} game={game} focus={focus} setFocus={setFocus} onJump={setCur} />}

          {review && m && (
            <div style={{ marginTop: 12 }}>
              <div className="coach">
                <div className="coach-avatar">🧑‍🏫</div>
                <div className="bubble">
                  <div className="headline">
                    <ClassIcon
                      cls={retry ? (retry.state === 'correct' ? 'best' : retry.state === 'wrong' ? 'mistake' : m.classification) : m.classification}
                      size={22}
                    />
                    <span style={{ color: retry ? undefined : CLASS_META[m.classification].color }}>
                      {retry
                        ? retry.state === 'try'
                          ? retry.checking
                            ? 'Checking…'
                            : `Find a better move for ${m.color === 'w' ? 'White' : 'Black'}`
                          : retry.state === 'correct'
                            ? 'Correct!'
                            : 'Not quite'
                        : m.headline}
                    </span>
                    {!retry && <ScoreChip score={m.scoreAfter} />}
                  </div>
                  {retry ? (
                    <p>
                      {retry.state === 'try' && 'Make your move on the board.'}
                      {retry.state === 'correct' && `That keeps the advantage. The engine's line: ${formatLine(m.fenBefore, m.bestLine.slice(0, 6))}`}
                      {retry.state === 'wrong' && 'That still isn’t the strongest move. Try again or see the solution.'}
                    </p>
                  ) : (
                    <>
                      <p>{m.comment}</p>
                      {m.bestSan && m.bestMove !== m.uci && !['book', 'forced'].includes(m.classification) && (
                        <div className="line">Best: {formatLine(m.fenBefore, m.bestLine.slice(0, 8))}</div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                {!retry && retryable && (
                  <button className="btn small primary" onClick={() => setRetry({ ply: cur, state: 'try' })}>
                    ↻ Retry
                  </button>
                )}
                {retry && retry.state === 'wrong' && (
                  <button className="btn small primary" onClick={() => setRetry({ ply: cur, state: 'try' })}>
                    Try again
                  </button>
                )}
                {retry && (
                  <button
                    className="btn small"
                    onClick={() => {
                      setRetry(null);
                      if (m.bestMove) setLine({ base: m.fenBefore, moves: review.positions[cur].lines[0].pv.slice(0, 10), idx: 1 });
                    }}
                  >
                    Show solution
                  </button>
                )}
                {!retry && m.bestMove && m.bestMove !== m.uci && !['book', 'forced'].includes(m.classification) && (
                  <button
                    className="btn small"
                    onClick={() => setLine(line ? null : { base: m.fenBefore, moves: review.positions[cur].lines[0].pv.slice(0, 10), idx: 1 })}
                  >
                    {line ? 'Back to game' : '▶ Best line'}
                  </button>
                )}
                {!retry && review.positions[cur + 1]?.lines[0]?.pv.length ? (
                  <button
                    className="btn small"
                    onClick={() => setLine(line ? null : { base: m.fenAfter, moves: review.positions[cur + 1].lines[0].pv.slice(0, 10), idx: 1 })}
                  >
                    {line ? 'Back to game' : '▶ Follow-up'}
                  </button>
                ) : null}
                <label className="toggle" style={{ fontSize: '0.85rem', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> Arrows
                </label>
              </div>
              {line && (
                <div className="card" style={{ marginTop: 10, background: 'var(--panel-2)', padding: 10 }}>
                  <div className="row">
                    <button className="icon-btn" onClick={() => setLine({ ...line, idx: Math.max(0, line.idx - 1) })}>
                      ◀
                    </button>
                    <div style={{ flex: 1, fontSize: '0.85rem' }}>
                      {formatLine(line.base, sanOf(line.base, line.moves))
                        .split(' ')
                        .map((t, i, arr) => (
                          <span key={i} style={{ opacity: tokenPly(arr, i) < line.idx ? 1 : 0.45 }}>
                            {t}{' '}
                          </span>
                        ))}
                    </div>
                    <button className="icon-btn" onClick={() => setLine({ ...line, idx: Math.min(line.moves.length, line.idx + 1) })}>
                      ▶
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {review && (
            <div style={{ marginTop: 14 }}>
              <AiCoachChat key={gameId} game={game} review={review} ply={cur} />
            </div>
          )}

          {review && (
            <div style={{ marginTop: 14 }}>
              <MoveList
                sans={moves.map((x) => x.san)}
                startFen={game.startFen}
                current={cur}
                onSelect={setCur}
                classes={moves.map((x) => x.classification)}
              />
            </div>
          )}
        </div>

        <div className="panel-foot">
          <button className="icon-btn" title="Overview" onClick={() => setCur(-1)}>
            ⏮
          </button>
          <button className="icon-btn" title="Previous (←)" onClick={() => setCur((c) => Math.max(-1, c - 1))} disabled={!review}>
            ◀
          </button>
          <button
            className="btn primary"
            style={{ flex: 1 }}
            onClick={() => setCur((c) => Math.min(moves.length - 1, c + 1))}
            disabled={!review || cur >= moves.length - 1}
          >
            {cur === -1 ? 'Start review ▶' : 'Next ▶'}
          </button>
          <button className="icon-btn" title="Last move" onClick={() => setCur(moves.length - 1)} disabled={!review}>
            ⏭
          </button>
          {review && (
            <button
              className="btn small"
              disabled={nextMistake === null}
              onClick={() => nextMistake !== null && setCur(nextMistake)}
              title="Jump to the next inaccuracy, mistake, miss or blunder"
            >
              Next mistake
            </button>
          )}
          <button className="btn small ghost" onClick={() => navigate(`/analysis?game=${gameId}${cur >= 0 ? `&ply=${cur + 1}` : ''}`)}>
            🔬 Analyse
          </button>
          {review && !running && review.depth < 20 && (
            <button
              className="btn small ghost"
              onClick={() => void useReviewer.getState().start(gameId, { depth: 20, force: true })}
              title="Run a deeper (slower) review"
            >
              Deeper
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Performance estimates from a handful of moves are noise, so only show them for real games. */
function ratingText(review: GameReview, c: 'w' | 'b') {
  const n = review.moves.filter((m) => m.color === c && m.classification !== 'book').length;
  return n >= 8 ? (c === 'w' ? review.white : review.black).estimatedRating : '–';
}

function sanOf(fen: string, moves: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of moves) {
    const mv = playUci(c, u);
    if (!mv) break;
    out.push(mv.san);
  }
  return out;
}

/** Ply index (within the line) that a token of a formatted line belongs to. */
function tokenPly(tokens: string[], i: number): number {
  let sans = 0;
  for (let k = 0; k < i; k++) if (!/^\d+\.+$/.test(tokens[k])) sans++;
  return sans;
}

function Overview({
  review,
  game,
  focus,
  setFocus,
  onJump,
}: {
  review: GameReview;
  game: GameRecord;
  focus: 'w' | 'b' | null;
  setFocus: (c: 'w' | 'b' | null) => void;
  onJump: (i: number) => void;
}) {
  const phases: Phase[] = ['opening', 'middlegame', 'endgame'];
  return (
    <div style={{ marginTop: 12 }}>
      <div className="coach">
        <div className="coach-avatar">🧑‍🏫</div>
        <div className="bubble">
          <div className="headline">Coach’s summary</div>
          <p>{review.summary}</p>
          {review.opening && (
            <div className="line">
              📖 {review.opening.eco} · {review.opening.name}
            </div>
          )}
        </div>
      </div>

      <table className="summary-table" style={{ marginTop: 14 }}>
        <tbody>
          <tr>
            <td className="n" style={{ fontWeight: 600 }}>
              {game.white.name}
            </td>
            <td />
            <td className="n" style={{ fontWeight: 600 }}>
              {game.black.name}
            </td>
          </tr>
          <tr>
            <td className="n">
              <span className="acc-box">{review.white.accuracy.toFixed(1)}</span>
            </td>
            <td className="label muted">Accuracy</td>
            <td className="n">
              <span className="acc-box dark">{review.black.accuracy.toFixed(1)}</span>
            </td>
          </tr>
          <tr>
            <td className="n" style={{ fontSize: '1.1rem' }}>
              {ratingText(review, 'w')}
            </td>
            <td className="label muted" title="Estimated playing strength in this game">
              Game rating
            </td>
            <td className="n" style={{ fontSize: '1.1rem' }}>
              {ratingText(review, 'b')}
            </td>
          </tr>
          {SUMMARY_CLASSES.map((c) => (
            <tr key={c}>
              <td className="n" style={{ color: CLASS_META[c].color }}>
                {review.white.counts[c]}
              </td>
              <td className="label">
                <ClassIcon cls={c} size={20} />
                <span style={{ minWidth: 80 }}>{CLASS_META[c].label}</span>
              </td>
              <td className="n" style={{ color: CLASS_META[c].color }}>
                {review.black.counts[c]}
              </td>
            </tr>
          ))}
          {phases.map((ph) => (
            <tr key={ph}>
              <td className="n">
                <PhaseBadge value={review.white.phases[ph]} />
              </td>
              <td className="label muted" style={{ textTransform: 'capitalize' }}>
                {ph}
              </td>
              <td className="n">
                <PhaseBadge value={review.black.phases[ph]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 14 }}>
        <h3 style={{ margin: 0 }}>Key moments</h3>
        <span className="spacer" />
        <Segmented
          value={focus ?? 'all'}
          onChange={(v) => setFocus(v === 'all' ? null : (v as 'w' | 'b'))}
          options={[
            { value: 'all', label: 'Both' },
            { value: 'w', label: 'White' },
            { value: 'b', label: 'Black' },
          ]}
        />
      </div>
      <div style={{ marginTop: 6 }}>
        {review.keyMoments
          .map((i) => review.moves[i])
          .filter((x) => !focus || x.color === focus)
          .map((x) => (
            <div key={x.ply} className="key-moment" onClick={() => onJump(x.ply)}>
              <ClassIcon cls={x.classification} size={20} />
              <b style={{ minWidth: 70 }}>
                {Math.floor(x.ply / 2) + 1}
                {x.color === 'w' ? '.' : '...'} {x.san}
              </b>
              <span className="muted" style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {x.headline}
              </span>
            </div>
          ))}
        {!review.keyMoments.length && <div className="faint">No big swings - a clean game.</div>}
      </div>
    </div>
  );
}
