import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Flame, SlidersHorizontal, Users } from 'lucide-react';
import { navigate } from '../lib/router';
import { BOTS, findBot, monogram } from '../lib/bots/bots';
import { Logo, Segmented, Toggle } from '../components/Widgets';
import { SectionTitle } from '../components/ui';
import { useProfile } from '../state/profile';
import { useLiveGame } from '../state/game';
import { liveStreak, todayLog, useLearn } from '../state/learn';
import { todayPlan } from '../lib/learn/today';
import { Accent } from '../components/Rich';
import { useDueCount } from './Puzzles';
import type { GameRecord } from '../lib/storage/db';
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

  return (
    <div className="page narrow">
      <header className="home-top">
        <span className="row only-mobile" style={{ gap: 10 }}>
          <Logo size={30} />
          <span className="brand-word">Outpost</span>
        </span>
        <span className="spacer" />
        {streak > 0 && (
          <span className="pill" title="Days in a row with some training">
            <Flame size={13} /> {streak}
          </span>
        )}
        <a className="pill" href="#/you" title="Your rating against the bots">
          {profile.rating}
        </a>
      </header>

      {live?.status === 'playing' ? (
        <section className="resume-card">
          <span className="avatar">{monogram(findBot(live.botId)?.name ?? 'Bot')}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="kicker">Game in progress</span>
            <div style={{ fontWeight: 500, fontSize: '1.1rem' }}>vs {findBot(live.botId)?.name ?? 'Bot'}</div>
          </span>
          <button className="btn primary" onClick={() => navigate('/game')}>
            Resume
          </button>
        </section>
      ) : (
        <section className="opponent-card">
          <div className="opp-hero">
            <span className="avatar xl">{monogram(bot.name)}</span>
            <div className="opp-name">{bot.name}</div>
            <div className="opp-meta">
              <span className="num">{bot.elo}</span>
              {bot.id === suggested.id && <span>· your level</span>}
              {bot.elo > suggested.elo + 150 && <span>· a challenge</span>}
            </div>
            <div className="opp-tagline">{bot.tagline}</div>
          </div>

          <div className="opp-strip" ref={strip}>
            {BOTS.map((b) => (
              <button
                key={b.id}
                className={`opp-chip ${b.id === bot.id ? 'on' : ''} ${b.id === suggested.id ? 'you' : ''}`}
                onClick={() => setSetup({ botId: b.id })}
                aria-label={`${b.name}, ${b.elo}`}
              >
                <span className="avatar">{monogram(b.name)}</span>
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
            <Toggle
              checked={setup.coach && !setup.tc}
              onChange={(coach) => setSetup(coach ? { coach, tc: 0 } : { coach })}
              label={
                <span className="coach-toggle">
                  Coach <span className="faint">stops you before a mistake · untimed, not rated</span>
                </span>
              }
            />
          </div>

          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button className="btn primary big play-go" onClick={() => startBotGame(setup)}>
              Play
            </button>
            <button className="btn big" onClick={() => navigate('/play')} aria-label="More game options" title="More options">
              <SlidersHorizontal size={18} />
            </button>
          </div>
          <button className="btn ghost block friend-link" onClick={() => navigate('/friend')}>
            <Users size={16} /> Play a friend
          </button>
        </section>
      )}

      <TodayPlan opponent={bot.name} onPlay={() => startBotGame(setup)} games={games} />

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

/** The daily plan: a few short things that help most today, ticked off as they're done. */
function TodayPlan({ opponent, onPlay, games }: { opponent: string; onPlay: () => void; games: GameRecord[] | null }) {
  const learn = useLearn();
  const due = useDueCount();
  const day = todayLog(learn.day);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const gamesToday = (games ?? []).filter((g) => g.source === 'bot' && g.createdAt >= start.getTime() && g.result !== '*').length;
  const items = todayPlan({ learn, day, due, gamesToday, opponent });
  const done = items.filter((i) => i.done).length;
  return (
    <section className="today">
      <div className="today-head">
        <h2 className="display">
          <Accent text={done === items.length ? 'All done *today*.' : 'Today'} />
        </h2>
        <span className="today-count">
          <span className="num-display">{done}</span>/{items.length}
        </span>
      </div>
      <div className="today-bar">
        <span style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <div className="list">
        {items.map((it) => (
          <button key={it.id} className={`today-item ${it.done ? 'done' : ''}`} onClick={() => (it.href ? navigate(it.href) : onPlay())}>
            <span className="ti-check" aria-hidden>
              {it.done && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="ti-body">
              <span className="ti-title">{it.title}</span>
              <span className="ti-sub">{it.sub}</span>
            </span>
            {it.count && !it.done && (
              <span className="ti-count">
                {it.count[0]}/{it.count[1]}
              </span>
            )}
            <ChevronRight size={18} className="ti-go" />
          </button>
        ))}
      </div>
      {done === items.length && <p className="today-note">Come back tomorrow for a new plan. Your streak counts every day you train.</p>}
    </section>
  );
}
