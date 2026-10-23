import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/router';
import { BOTS, findBot } from '../lib/bots/bots';
import { LESSONS } from '../lib/learn/curriculum';
import { useTrainingFocus } from '../lib/learn/focus';
import { useProfile } from '../state/profile';
import { useLiveGame } from '../state/game';
import { useLearn } from '../state/learn';
import { TIME_CONTROLS, hasSavedSetup, loadSetup, saveSetup, setupBot, startBotGame, suggestedBot, type Setup } from '../state/playSetup';
import { GameRow, useGames } from './Games';
import { nextLessonFor, useDueCount } from './Learn';

function Sparkline({ values, width = 260, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / (max - min)) * height).toFixed(1)}`);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} aria-label="Rating history">
      <polyline points={pts.join(' ')} fill="none" stroke="#81b64c" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The clocks offered as one-tap chips on the home screen. */
const QUICK_TCS = [0, 2, 3, 4, 5];

export function HomePage() {
  const profile = useProfile();
  const games = useGames();
  const live = useLiveGame((s) => s.game);
  const learn = useLearn();
  const focus = useTrainingFocus();
  const due = useDueCount();
  const [setup, setSetupState] = useState<Setup>(() => {
    const s = loadSetup();
    return hasSavedSetup() ? s : { ...s, botId: suggestedBot(profile.rating).id };
  });
  const setSetup = (patch: Partial<Setup>) => {
    const next = { ...setup, ...patch };
    setSetupState(next);
    saveSetup(next);
  };
  const bot = setupBot(setup);
  const suggested = suggestedBot(profile.rating);
  const play = (botId?: string) => {
    const s = botId ? { ...setup, botId } : setup;
    saveSetup(s);
    startBotGame(s);
  };

  const avgAcc = useMemo(() => {
    const recent = (games ?? []).filter((g) => g.userColor && g.accuracy).slice(0, 10);
    return recent.length ? recent.reduce((a, g) => a + g.accuracy![g.userColor!], 0) / recent.length : null;
  }, [games]);
  const nextLesson = nextLessonFor(learn.lessons);
  // Start the opponent strip at your level (scrolls the strip only, never the page).
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector<HTMLElement>('.bot-chip.suggested');
    if (box && el) box.scrollLeft = el.offsetLeft - box.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, []);
  const lessonsDone = LESSONS.filter((l) => learn.lessons[l.id]?.done).length;

  return (
    <div className="page home">
      {live?.status === 'playing' ? (
        <section className="quick-play">
          <div className="qp-opponent">
            <div className="avatar lg" style={{ background: findBot(live.botId)?.tint }}>
              {findBot(live.botId)?.avatar}
            </div>
            <div>
              <div className="faint">Game in progress</div>
              <b className="qp-name">{findBot(live.botId)?.name ?? 'Bot'}</b>
            </div>
          </div>
          <button className="btn primary big qp-go" onClick={() => navigate('/game')}>
            ▶ Resume game
          </button>
        </section>
      ) : (
        <section className="quick-play">
          <div className="qp-opponent">
            <div className="avatar lg" style={{ background: bot.tint }}>
              {bot.avatar}
            </div>
            <div className="qp-who">
              <b className="qp-name">{bot.name}</b>
              <span className="faint">
                {bot.elo} Elo{bot.id === suggested.id ? ' · your level' : ''}
              </span>
            </div>
            <a className="qp-change" href="#/play">
              More options
            </a>
          </div>
          <button className="btn primary big qp-go" onClick={() => play()}>
            ▶ Play
          </button>
          <div className="qp-options">
            <div className="chip-row">
              {QUICK_TCS.map((i) => (
                <button key={i} className={`chip ${setup.tc === i ? 'on' : ''}`} onClick={() => setSetup({ tc: i })}>
                  {TIME_CONTROLS[i].label}
                </button>
              ))}
            </div>
            <div className="chip-row">
              {(['w', 'random', 'b'] as const).map((c) => (
                <button key={c} className={`chip ${setup.color === c ? 'on' : ''}`} onClick={() => setSetup({ color: c })}>
                  {c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '🎲 Random'}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="bot-strip-head">
        <h2>Tap an opponent to start</h2>
      </div>
      <div className="bot-strip" ref={strip}>
        {BOTS.map((b) => (
          <button
            key={b.id}
            className={`bot-chip ${b.id === suggested.id ? 'suggested' : ''}`}
            onClick={() => play(b.id)}
            disabled={live?.status === 'playing'}
          >
            <span className="avatar" style={{ background: b.tint }}>
              {b.avatar}
            </span>
            <span className="nm">{b.name}</span>
            <span className="elo">{b.elo}</span>
          </button>
        ))}
      </div>

      <h2 className="home-h2">Train</h2>
      <div className="train-grid">
        {focus ? (
          <button className="train-card primary" onClick={() => navigate(`/learn/${focus.lesson.id}`)}>
            <span className="train-ico">{focus.lesson.icon}</span>
            <span>
              <b>Work on: {focus.lesson.title}</b>
              <span className="muted">
                {focus.title} cost you {focus.count} time{focus.count === 1 ? '' : 's'} in recent games
              </span>
            </span>
          </button>
        ) : (
          <button className="train-card primary" onClick={() => navigate(`/learn/${nextLesson.id}`)}>
            <span className="train-ico">{nextLesson.icon}</span>
            <span>
              <b>
                {lessonsDone ? 'Next lesson' : 'First lesson'}: {nextLesson.title}
              </b>
              <span className="muted">{nextLesson.summary}</span>
            </span>
          </button>
        )}
        <button className="train-card" onClick={() => navigate('/tactics')}>
          <span className="train-ico">🧩</span>
          <span>
            <b>Puzzles</b>
            <span className="muted">Tactics rating {learn.rating}</span>
          </span>
        </button>
        <button className="train-card" onClick={() => navigate(due ? '/practice' : '/learn')}>
          <span className="train-ico">{due ? '🎯' : '🎓'}</span>
          <span>
            <b>{due ? `${due} of your mistakes to fix` : 'All lessons'}</b>
            <span className="muted">{due ? 'From your reviewed games' : `${lessonsDone}/${LESSONS.length} done`}</span>
          </span>
        </button>
      </div>

      <section className="home-stats">
        <div className="stat">
          <span className="k">Rating</span>
          <span className="v">{profile.rating}</span>
        </div>
        <div className="stat">
          <span className="k">W / D / L</span>
          <span className="v">
            {profile.wins}/{profile.draws}/{profile.losses}
          </span>
        </div>
        <div className="stat">
          <span className="k">Accuracy</span>
          <span className="v">{avgAcc !== null ? `${avgAcc.toFixed(0)}%` : '–'}</span>
        </div>
        <div className="home-spark">
          <Sparkline values={profile.history.map((h) => h.rating)} />
        </div>
      </section>

      <section className="card home-recent" style={{ padding: 0 }}>
        <div className="row" style={{ padding: '12px 14px 4px' }}>
          <h2 style={{ margin: 0 }}>Recent games</h2>
          <span className="spacer" />
          <a href="#/games">All games</a>
        </div>
        {games && games.length ? (
          <table className="table">
            <tbody>
              {games.slice(0, 4).map((g) => (
                <GameRow key={g.id} g={g} compact />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No games yet - tap Play above, or import your games.</div>
        )}
      </section>

      <div className="grid-cards home-links">
        <a className="action-card" href="#/import">
          <span className="ico">📥</span>
          <span>
            <b>Review chess.com / lichess games</b>
            <span className="muted">Import by username or paste a PGN</span>
          </span>
        </a>
        <a className="action-card" href="#/analysis">
          <span className="ico">🔬</span>
          <span>
            <b>Analysis board</b>
            <span className="muted">Engine lines, variations, PGN and FEN</span>
          </span>
        </a>
      </div>
    </div>
  );
}
