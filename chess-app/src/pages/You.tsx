import { useMemo } from 'react';
import {
  BookOpen,
  Check,
  ChessKnight,
  Download,
  Flame,
  GraduationCap,
  History,
  Microscope,
  Puzzle,
  Palette,
  Settings,
  UserRound,
} from 'lucide-react';
import { LEVELS, currentLevel, levelPassed } from '../lib/learn/levels';
import { findLesson } from '../lib/learn/curriculum';
import { navigate } from '../lib/router';
import { Grade, ListRow, Meter, SectionTitle, Sparkline, Stars } from '../components/ui';
import { useProfile } from '../state/profile';
import { liveStreak, useLearn } from '../state/learn';
import { THEME_SETS, useDueCount } from './Puzzles';
import { GameListRow, useGames } from './Games';
import { CountUp } from '../components/Rich';

export function YouPage() {
  const profile = useProfile();
  const learn = useLearn();
  const games = useGames();
  const due = useDueCount();
  const level = currentLevel(learn);
  const streak = liveStreak(learn);
  const passed = LEVELS.filter((l) => levelPassed(learn, l)).length;

  const skills = useMemo(
    () =>
      THEME_SETS.map((s) => {
        let ok = 0;
        let fail = 0;
        for (const t of s.themes) {
          ok += learn.themes[t]?.ok ?? 0;
          fail += learn.themes[t]?.fail ?? 0;
        }
        return { ...s, n: ok + fail, pct: ok + fail ? ok / (ok + fail) : 0 };
      }).filter((s) => s.n >= 3),
    [learn.themes],
  );
  const weakest = [...skills].sort((a, b) => a.pct - b.pct)[0];
  const avgAcc = useMemo(() => {
    const recent = (games ?? []).filter((g) => g.userColor && g.accuracy).slice(0, 10);
    return recent.length ? recent.reduce((a, g) => a + g.accuracy![g.userColor!], 0) / recent.length : null;
  }, [games]);

  return (
    <div className="page narrow">
      <header className="you-head">
        <span className="you-avatar">
          <UserRound size={32} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>You</h1>
          <div className="muted" style={{ fontSize: '0.9rem' }}>
            Level {level.n} · {level.name}
            {streak > 0 && (
              <>
                {' · '}
                <Flame size={13} style={{ verticalAlign: -1, color: 'var(--gold)' }} /> {streak} day streak
              </>
            )}
          </div>
        </div>
      </header>

      <div className="rating-tiles">
        <button
          className="rating-tile"
          style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          onClick={() => navigate('/games')}
        >
          <span className="rt-k">
            <ChessKnight size={14} /> Games
          </span>
          <span className="rt-v">
            <CountUp value={profile.rating} id="bot-rating" />
          </span>
          <span className="rt-s">
            {profile.wins}W {profile.draws}D {profile.losses}L
          </span>
        </button>
        <button
          className="rating-tile"
          style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          onClick={() => navigate('/puzzles')}
        >
          <span className="rt-k">
            <Puzzle size={14} /> Puzzles
          </span>
          <span className="rt-v">
            <CountUp value={learn.rating} id="puzzle-rating" />
          </span>
          <span className="rt-s">{learn.attempts ? `${Math.round((learn.solved / learn.attempts) * 100)}% solved` : 'Not rated yet'}</span>
        </button>
        <button
          className="rating-tile"
          style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          onClick={() => navigate('/learn')}
        >
          <span className="rt-k">
            <GraduationCap size={14} /> Course
          </span>
          <span className="rt-v">
            {passed}/{LEVELS.length}
          </span>
          <span className="rt-s">levels passed</span>
        </button>
      </div>

      {profile.history.length > 1 && (
        <div className="card" style={{ marginTop: 10, padding: '12px 16px' }}>
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="faint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Game rating
            </span>
            <span className="spacer" />
            {avgAcc !== null && (
              <span className="faint" style={{ fontSize: '0.8rem' }}>
                Recent accuracy {avgAcc.toFixed(0)}%
              </span>
            )}
          </div>
          <Sparkline values={profile.history.map((h) => h.rating).slice(-60)} color="var(--accent)" />
        </div>
      )}

      <SectionTitle>Report card</SectionTitle>
      <div className="list report">
        {LEVELS.map((l) => {
          const exam = learn.exams[l.id];
          const lessons = l.lessons.map((id) => ({ id, p: learn.lessons[id] }));
          const done = lessons.filter((x) => x.p?.done);
          const stars = done.reduce((a, x) => a + (x.p?.stars ?? 0), 0);
          return (
            <div className="report-row" key={l.id}>
              <span className="level-badge">{l.n}</span>
              <span className="rr-body">
                <span className="rr-title">{l.name}</span>
                <div className="rr-sub">
                  {done.length}/{l.lessons.length} lessons
                  {done.length ? ` · ${stars}/${l.lessons.length * 3} stars` : ''}
                  {exam && !exam.placed ? ` · exam ${exam.best}/${exam.total}` : exam?.placed ? ' · placed' : ''}
                </div>
              </span>
              {exam?.passed ? <Grade g={exam.grade} /> : <span className="pill">{exam ? 'Retake' : 'Not taken'}</span>}
            </div>
          );
        })}
      </div>

      <SectionTitle>Skills</SectionTitle>
      {skills.length ? (
        <div className="list skill-list">
          {skills.map((s) => (
            <div className="skill" key={s.id}>
              <span className="sk-name">{s.title}</span>
              <Meter value={s.pct} gold={s.pct < 0.5} />
              <span className="sk-val">{Math.round(s.pct * 100)}%</span>
            </div>
          ))}
          {weakest && weakest.pct < 0.7 && (
            <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => navigate(`/puzzles/play?set=${weakest.id}`)}>
              Train your weakest: {weakest.title}
            </button>
          )}
        </div>
      ) : (
        <div className="card muted" style={{ fontSize: '0.9rem' }}>
          Solve a few puzzles on each theme and your strengths and weaknesses will show up here.
        </div>
      )}

      {Object.values(learn.lessons).some((l) => l.done) && (
        <>
          <SectionTitle>Lessons</SectionTitle>
          <div className="list">
            {LEVELS.flatMap((l) => l.lessons)
              .filter((id) => learn.lessons[id]?.done)
              .slice(-6)
              .map((id) => {
                const lesson = findLesson(id)!;
                const p = learn.lessons[id];
                return (
                  <ListRow
                    key={id}
                    icon={<Check size={16} />}
                    title={lesson.title}
                    sub={`Best ${p.best ?? 0}%`}
                    end={<Stars n={p.stars ?? 1} />}
                    href={`/learn/${id}`}
                  />
                );
              })}
          </div>
        </>
      )}

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

      <SectionTitle>Tools</SectionTitle>
      <div className="list">
        <ListRow icon={<History size={20} />} title="Games" sub="Every game you played or imported, with reviews" href="/games" />
        <ListRow
          icon={<BookOpen size={20} />}
          iconClass="ico-danger"
          title="Your mistakes"
          sub={due ? `${due} positions to fix today` : 'Positions from your games, on spaced repetition'}
          href="/practice"
        />
        <ListRow icon={<Microscope size={20} />} title="Analysis board" sub="Engine lines, variations, PGN and FEN" href="/analysis" />
        <ListRow icon={<Download size={20} />} title="Import games" sub="From chess.com, lichess or a PGN" href="/import" />
        <ListRow icon={<Palette size={20} />} title="Appearance" sub="Themes, boards, pieces and text size" href="/appearance" />
        <ListRow icon={<Settings size={20} />} title="Settings" sub="Board, sound, engine and data" href="/settings" />
      </div>
    </div>
  );
}
