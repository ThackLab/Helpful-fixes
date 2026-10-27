import { useEffect, useRef, useState } from 'react';
import { Flame, Play, Puzzle, SlidersHorizontal, Trophy } from 'lucide-react';
import { navigate } from '../lib/router';
import { BOTS, findBot } from '../lib/bots/bots';
import { findLesson } from '../lib/learn/curriculum';
import { LEVELS, levelProgress, nextStep } from '../lib/learn/levels';
import { Logo, Segmented } from '../components/Widgets';
import { Meter, SectionTitle } from '../components/ui';
import { useProfile } from '../state/profile';
import { useLiveGame } from '../state/game';
import { liveStreak, useLearn } from '../state/learn';
import { TIME_CONTROLS, hasSavedSetup, loadSetup, saveSetup, setupBot, startBotGame, suggestedBot, type Setup } from '../state/playSetup';
import { GameListRow, useGames } from './Games';

/** The clocks offered on the home screen. */
const QUICK_TCS = [0, 2, 3, 4, 5];

export function HomePage() {
  const profile = useProfile();
  const games = useGames();
  const live = useLiveGame((s) => s.game);
  const learn = useLearn();
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
  const streak = liveStreak(learn);

  // Keep the selected opponent in view inside the strip (never scrolls the page).
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector<HTMLElement>('.opp-chip.on');
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [bot.id]);

  const step = nextStep(learn);
  const stepLesson = step.kind === 'lesson' ? findLesson(step.lessonId) : undefined;
  const stepLevel = step.kind === 'done' ? LEVELS[LEVELS.length - 1] : step.level;
  const prog = levelProgress(learn, stepLevel);

  return (
    <div className="page narrow">
      <header className="home-top">
        <span className="row only-mobile" style={{ gap: 10 }}>
          <Logo size={30} />
          <span className="brand-word">Outpost</span>
        </span>
        <span className="spacer" />
        {streak > 0 && (
          <span className="pill gold" title="Days in a row with some training">
            <Flame size={14} /> {streak}
          </span>
        )}
        <a className="pill" href="#/you" title="Your rating against the bots">
          <Trophy size={14} /> {profile.rating}
        </a>
      </header>

      {live?.status === 'playing' ? (
        <section className="resume-card">
          <span className="avatar lg" style={{ background: findBot(live.botId)?.tint, width: 60, height: 60, fontSize: '2.2rem', borderRadius: 18 }}>
            {findBot(live.botId)?.avatar}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="faint" style={{ fontSize: '0.8rem' }}>
              Game in progress
            </span>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>vs {findBot(live.botId)?.name ?? 'Bot'}</div>
          </span>
          <button className="btn primary big" onClick={() => navigate('/game')}>
            <Play size={18} fill="currentColor" /> Resume
          </button>
        </section>
      ) : (
        <section className="opponent-card" style={{ ['--tint' as string]: bot.tint }}>
          <div className="opp-hero">
            <span className="avatar lg" style={{ background: bot.tint }}>
              {bot.avatar}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="opp-name">{bot.name}</div>
              <div className="opp-meta">
                <span className="pill">{bot.elo}</span>
                {bot.id === suggested.id && <span className="pill accent">Your level</span>}
                {bot.elo > suggested.elo + 150 && <span className="pill gold">Challenge</span>}
              </div>
              <div className="opp-tagline">{bot.tagline}</div>
            </div>
          </div>

          <div className="opp-strip" ref={strip}>
            {BOTS.map((b) => (
              <button
                key={b.id}
                className={`opp-chip ${b.id === bot.id ? 'on' : ''} ${b.id === suggested.id ? 'you' : ''}`}
                onClick={() => setSetup({ botId: b.id })}
                aria-label={`${b.name}, ${b.elo}`}
              >
                <span className="avatar" style={{ background: b.tint }}>
                  {b.avatar}
                </span>
                <span className="elo">{b.elo}</span>
              </button>
            ))}
          </div>

          <div className="opp-options">
            <Segmented
              value={setup.tc}
              onChange={(tc) => setSetup({ tc })}
              options={QUICK_TCS.map((i) => ({ value: i, label: TIME_CONTROLS[i].label }))}
            />
            <Segmented
              value={setup.color}
              onChange={(color) => setSetup({ color })}
              options={[
                { value: 'w', label: 'White' },
                { value: 'random', label: 'Random' },
                { value: 'b', label: 'Black' },
              ]}
            />
          </div>

          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button className="btn primary big play-go" onClick={() => startBotGame(setup)}>
              <Play size={20} fill="currentColor" /> Play {bot.name}
            </button>
            <button className="btn big" onClick={() => navigate('/play')} aria-label="More game options" title="More options">
              <SlidersHorizontal size={20} />
            </button>
          </div>
        </section>
      )}

      <SectionTitle>Keep improving</SectionTitle>
      <div style={{ display: 'grid', gap: 10 }}>
        <button
          className="continue-card"
          onClick={() => navigate(step.kind === 'lesson' ? `/learn/${step.lessonId}` : step.kind === 'exam' ? `/exam/${step.level.id}` : '/learn')}
        >
          <span className="cc-ico" style={{ background: `${stepLevel.color}22`, color: stepLevel.color }}>
            {step.kind === 'exam' ? <Trophy size={24} /> : (stepLesson?.icon ?? '🎓')}
          </span>
          <span className="cc-body">
            <span className="cc-kicker">
              Level {stepLevel.n} · {stepLevel.name}
            </span>
            <span className="cc-title">
              {step.kind === 'lesson' ? stepLesson?.title : step.kind === 'exam' ? `Level ${stepLevel.n} exam` : 'Course complete'}
            </span>
            <span className="cc-sub">
              {step.kind === 'lesson'
                ? stepLesson?.summary
                : step.kind === 'exam'
                  ? 'Pass it to unlock the next level'
                  : 'Every level passed. Keep sharp with puzzles.'}
            </span>
            <Meter value={prog.done / prog.total} />
          </span>
        </button>
        <button className="continue-card" onClick={() => navigate('/puzzles')}>
          <span className="cc-ico ico-info">
            <Puzzle size={24} />
          </span>
          <span className="cc-body">
            <span className="cc-kicker">Puzzles</span>
            <span className="cc-title">Rating {learn.rating}</span>
            <span className="cc-sub">
              {learn.attempts ? `${learn.solved} solved · best rush ${learn.rushBest}` : 'Find the winning move. Your rating adapts as you go.'}
            </span>
          </span>
        </button>
      </div>

      {games && games.length > 0 && (
        <>
          <SectionTitle action={{ label: 'All games', href: '#/games' }}>Recent games</SectionTitle>
          <div className="list game-rows">
            {games.slice(0, 3).map((g) => (
              <GameListRow key={g.id} g={g} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
