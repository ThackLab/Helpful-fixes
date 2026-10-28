import { useMemo } from 'react';
import { Bot, Check, ChevronRight, Flame, GraduationCap, Plus, Puzzle, Settings, Star, Sun, Timer, Users, Zap } from 'lucide-react';
import { Chess } from 'chess.js';
import { navigate } from '../lib/router';
import { findBot, monogram } from '../lib/bots/bots';
import { useProfile } from '../state/profile';
import { useLiveGame } from '../state/game';
import { useSettings } from '../state/settings';
import { liveStreak, todayLog, useLearn } from '../state/learn';
import { todayPlan } from '../lib/learn/today';
import { currentLevel, nextStep } from '../lib/learn/levels';
import { findLesson } from '../lib/learn/curriculum';
import { BOARDS, resolveBoard } from '../lib/appearance';
import type { GameRecord } from '../lib/storage/db';
import { useDueCount } from './Puzzles';
import { dueLines, usePackLines } from './Openings';
import { useRepertoire } from '../state/repertoire';
import { loadSetup, setupBot } from '../state/playSetup';
import { useGames, userOutcome } from './Games';
import { useOpponents, type Opponent } from '../state/opponents';

/** A position for the puzzle card's picture. */
const HERO_FEN = 'r1b1k2r/ppppqppp/2n2n2/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 6 5';

/** A small static board, drawn with the current board colours and piece set. */
export function MiniBoard({ fen, className }: { fen: string; className?: string }) {
  const boardId = useSettings((s) => resolveBoard(s));
  const colours = BOARDS.find((b) => b.id === boardId) ?? BOARDS[0];
  const rows = useMemo(() => new Chess(fen).board(), [fen]);
  return (
    <div className={`mini-board ${className ?? ''}`} aria-hidden>
      {rows.flatMap((row, r) =>
        row.map((p, f) => (
          <span key={`${r}${f}`} style={{ background: (r + f) % 2 ? colours.dark : colours.light }}>
            {p && <i className={`fig-${p.color}${p.type.toUpperCase()}`} />}
          </span>
        )),
      )}
    </div>
  );
}

function Section({ title, count, href, children }: { title: string; count?: number; href?: string; children: React.ReactNode }) {
  return (
    <section className="dash-section">
      <div className="dash-head">
        <h2>
          {title}
          {count !== undefined && count > 0 && <span className="dash-count">{count}</span>}
        </h2>
        {href && <a href={href}>View all</a>}
      </div>
      {children}
    </section>
  );
}

export function HomePage() {
  const profile = useProfile();
  const learn = useLearn();
  const games = useGames();
  const live = useLiveGame((s) => s.game);
  const name = useSettings((s) => s.playerName);
  const streak = liveStreak(learn);
  const step = nextStep(learn);
  const lesson = step.kind === 'lesson' ? findLesson(step.lessonId) : undefined;
  const level = currentLevel(learn);
  const due = useDueCount();
  const opponents = useOpponents();
  const bot = setupBot(loadSetup());

  return (
    <div className="page narrow dash">
      <header className="dash-top">
        <a href="#/you" className="me-avatar" aria-label="Your profile">
          {monogram(name && name !== 'You' ? name : 'Me')}
        </a>
        <span className="dash-stat" title="Days in a row with some training">
          <Flame size={22} className="ic-flame" fill="currentColor" />
          <b>{streak}</b>
        </span>
        <span className="spacer" />
        <a href="#/friend" className="dash-icon ic-friends" aria-label="Friends">
          <Users size={24} />
        </a>
        <a href="#/settings" className="dash-icon" aria-label="Settings">
          <Settings size={24} />
        </a>
      </header>

      {live?.status === 'playing' && (
        <button className="dash-resume" onClick={() => navigate('/game')}>
          <span className="avatar">{monogram(findBot(live.botId)?.name ?? 'Bot')}</span>
          <span className="dr-body">
            <b>Your game vs {findBot(live.botId)?.name ?? 'the bot'}</b>
            <span>Tap to carry on</span>
          </span>
          <span className="btn primary small">Resume</span>
        </button>
      )}

      <div className="dash-hero">
        <button className="hero-card hero-puzzles" onClick={() => navigate('/puzzles/play')}>
          <MiniBoard fen={HERO_FEN} className="hero-art" />
          <span className="hero-title">
            <Puzzle size={26} className="ic-puzzle" fill="currentColor" /> Puzzles
          </span>
          <span className="hero-meta">
            <b>{learn.rating}</b>
            <span className="hero-streak">{learn.solved} solved</span>
          </span>
          <span className="hero-bar">
            <span style={{ width: `${Math.min(100, ((learn.solved % 10) / 10) * 100)}%` }} />
          </span>
          <span className="btn primary hero-go">Solve!</span>
        </button>
        <button className="hero-card hero-lesson" onClick={() => navigate(lesson ? `/learn/${lesson.id}` : '/learn')}>
          <span className="hero-emoji" aria-hidden>
            {lesson?.icon ?? '🎓'}
          </span>
          <span className="hero-title">
            <GraduationCap size={26} className="ic-learn" /> {lesson ? 'Next lesson' : 'Learn'}
          </span>
          <span className="hero-sub">{lesson ? lesson.title : `Level ${level.n}: ${level.name}`}</span>
          <span className="btn primary hero-go">{learn.lessons[lesson?.id ?? '']?.step ? 'Continue' : 'Start'}</span>
        </button>
        <button className="hero-card hero-rush" onClick={() => navigate('/puzzles/rush')}>
          <span className="hero-emoji" aria-hidden>
            ⚡
          </span>
          <span className="hero-title">
            <Zap size={26} className="ic-zap" fill="currentColor" /> Puzzle Rush
          </span>
          <span className="hero-sub">{learn.rushBest ? `Best ${learn.rushBest}` : '3 minutes, 3 lives'}</span>
          <span className="btn primary hero-go">Go!</span>
        </button>
      </div>

      <Section title="Ratings" href="#/you">
        <div className="tile-row">
          <a className="tile" href="#/play">
            <Bot size={34} className="ic-bot" />
            <b>{profile.rating}</b>
            <span>Bots</span>
          </a>
          <a className="tile" href="#/puzzles">
            <Puzzle size={34} className="ic-puzzle" fill="currentColor" />
            <b>{learn.rating}</b>
            <span>Puzzles</span>
          </a>
          <a className="tile" href="#/puzzles/rush">
            <Zap size={34} className="ic-zap" fill="currentColor" />
            <b>{learn.rushBest || '–'}</b>
            <span>Rush</span>
          </a>
          <a className="tile" href="#/learn">
            <GraduationCap size={34} className="ic-learn" />
            <b>{level.n}</b>
            <span>Level</span>
          </a>
          {due > 0 && (
            <a className="tile" href="#/practice">
              <Star size={34} className="ic-star" fill="currentColor" />
              <b>{due}</b>
              <span>Mistakes</span>
            </a>
          )}
        </div>
      </Section>

      <Section title="Friends" count={opponents.length} href="#/friend">
        <div className="friend-row">
          {opponents.slice(0, 8).map((o) => (
            <FriendCard key={o.key} o={o} />
          ))}
          <button className="fr-card add" onClick={() => navigate('/friend')}>
            <span className="fc-avatar add">
              <Plus size={34} />
            </span>
            <b>Challenge</b>
            <span className="fc-sub">anyone, by link</span>
            <span className="btn fc-btn">Invite</span>
          </button>
        </div>
      </Section>

      <TodayPlan opponent={bot.name} games={games} />

      {games && games.length > 0 && (
        <Section title="Game history" count={games.length} href="#/games">
          <div className="history">
            {games.slice(0, 6).map((g) => (
              <HistoryRow key={g.id} g={g} />
            ))}
          </div>
        </Section>
      )}

      <div className="play-dock">
        <button className="btn primary play-xl" onClick={() => navigate('/play')}>
          Play
        </button>
      </div>
    </div>
  );
}

function FriendCard({ o }: { o: Opponent }) {
  return (
    <button className="fr-card" onClick={() => navigate(o.href)}>
      <span className="fc-avatar">{monogram(o.name)}</span>
      <b>{o.name}</b>
      <span className={`fc-sub ${o.yourMove ? 'go' : ''}`}>{o.status}</span>
      <span className={`btn fc-btn ${o.yourMove ? 'primary' : ''}`}>{o.yourMove ? 'Your move' : o.active ? 'Open' : 'Challenge'}</span>
    </button>
  );
}

/** The clock icon chess.com-style: bots get a robot, untimed games a sun. */
function ModeIcon({ g }: { g: GameRecord }) {
  if (g.source === 'bot') return <Bot size={22} className="ic-bot" />;
  const m = /^(\d+(?:\.\d+)?)\+/.exec(g.timeControl ?? '');
  const mins = m ? +m[1] : null;
  if (mins === null) return <Sun size={22} className="ic-sun" />;
  if (mins < 10) return <Zap size={22} className="ic-zap" fill="currentColor" />;
  return <Timer size={22} className="ic-timer" />;
}

function HistoryRow({ g }: { g: GameRecord }) {
  const opp = g.userColor ? (g.userColor === 'w' ? g.black : g.white) : null;
  const o = userOutcome(g);
  const acc = g.accuracy && g.userColor ? g.accuracy[g.userColor] : undefined;
  const name = opp ? opp.name : `${g.white.name} – ${g.black.name}`;
  return (
    <div
      className="h-row"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/review/${g.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/review/${g.id}`)}
    >
      <ModeIcon g={g} />
      <span className="h-avatar">{monogram(name)}</span>
      <span className="h-name">
        <b>{name}</b>
        {opp?.elo ? <span className="faint"> ({opp.elo})</span> : null}
      </span>
      <span className={`h-result ${o ?? 'none'}`} aria-label={o ?? g.result}>
        {o === 'win' ? '+' : o === 'loss' ? '−' : '='}
      </span>
      {acc !== undefined ? (
        <span className="h-acc">{acc.toFixed(1)}</span>
      ) : (
        <span className="h-review" aria-label="Review">
          <Star size={20} fill="currentColor" />
        </span>
      )}
    </div>
  );
}

/** The daily plan: a few short things that help most today, ticked off as they're done. */
function TodayPlan({ opponent, games }: { opponent: string; games: GameRecord[] | null }) {
  const learn = useLearn();
  const due = useDueCount();
  const day = todayLog(learn.day);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const gamesToday = (games ?? []).filter((g) => g.source === 'bot' && g.createdAt >= start.getTime() && g.result !== '*').length;
  const repertoire = useRepertoire();
  const packLines = usePackLines();
  const openingsDue = dueLines(packLines, repertoire.selected, repertoire.lines);
  const firstDue = repertoire.selected.find((id) => dueLines(packLines, [id], repertoire.lines) > 0);
  const items = todayPlan({ learn, day, due, gamesToday, opponent, openingsDue, openingsHref: firstDue ? `/openings/${firstDue}` : '/openings' });
  const done = items.filter((i) => i.done).length;
  return (
    <Section title={done === items.length ? 'All done today' : 'Today’s training'}>
      <div className="today card-box">
        <div className="today-bar">
          <span style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
        {items.map((it) => (
          <button key={it.id} className={`today-item ${it.done ? 'done' : ''}`} onClick={() => navigate(it.href ?? '/play')}>
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
    </Section>
  );
}
