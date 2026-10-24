import { useEffect, useState } from 'react';
import { LESSONS, LESSON_GROUPS, type Lesson } from '../lib/learn/curriculum';
import { useTrainingFocus } from '../lib/learn/focus';
import { loadPuzzles, type TacticPuzzle } from '../lib/learn/puzzles';
import { listPuzzles, onDbChange } from '../lib/storage/db';
import { navigate } from '../lib/router';
import { useLearn } from '../state/learn';
import type { PuzzleTheme } from '../lib/learn/tags';

/** Puzzle sets offered as shortcuts on the Learn page. */
const PUZZLE_SETS: { label: string; themes: PuzzleTheme[] }[] = [
  { label: 'Forks', themes: ['fork'] },
  { label: 'Pins & skewers', themes: ['pin', 'skewer'] },
  { label: 'Discovered attacks', themes: ['discovered', 'doubleCheck'] },
  { label: 'Combinations', themes: ['setup', 'sacrifice', 'removeDefender'] },
  { label: 'Checkmates', themes: ['mateIn1', 'mateIn2', 'mateIn3', 'backRankMate', 'smotheredMate'] },
  { label: 'Free pieces', themes: ['hanging'] },
];

export function useDueCount() {
  const [due, setDue] = useState(0);
  useEffect(() => {
    const load = () => listPuzzles().then((ps) => setDue(ps.filter((p) => p.due <= Date.now()).length));
    void load();
    return onDbChange(load);
  }, []);
  return due;
}

/** The first lesson not finished yet. */
export function nextLessonFor(progress: Record<string, { done: boolean }>): Lesson {
  return LESSONS.find((l) => !progress[l.id]?.done) ?? LESSONS[0];
}

export function LearnPage() {
  const { lessons, rating, attempts, themes } = useLearn();
  const focus = useTrainingFocus();
  const due = useDueCount();
  const [puzzles, setPuzzles] = useState<TacticPuzzle[]>([]);
  useEffect(() => {
    void loadPuzzles().then(setPuzzles);
  }, []);
  const doneCount = LESSONS.filter((l) => lessons[l.id]?.done).length;
  const next = nextLessonFor(lessons);
  const countFor = (l: Lesson) => (l.themes.length ? puzzles.filter((p) => p.themes.some((t) => l.themes.includes(t))).length : 0);
  const solvedFor = (l: Lesson) => l.themes.reduce((a, t) => a + (themes[t]?.ok ?? 0), 0);

  return (
    <div className="page learn-page">
      <h1 className="page-title">Learn</h1>

      <div className="train-grid">
        <button className="train-card primary" onClick={() => navigate(`/learn/${next.id}`)}>
          <span className="train-ico">{next.icon}</span>
          <span>
            <b>
              {doneCount ? 'Continue' : 'Start'}: {next.title}
            </b>
            <span className="muted">
              {doneCount}/{LESSONS.length} lessons done
            </span>
          </span>
        </button>
        <button className="train-card" onClick={() => navigate('/tactics')}>
          <span className="train-ico">🧩</span>
          <span>
            <b>Puzzle trainer</b>
            <span className="muted">
              Rating {rating}
              {attempts ? ` · ${attempts} played` : ''} · {puzzles.length || '…'} puzzles
            </span>
          </span>
        </button>
        <button className="train-card" onClick={() => navigate('/practice')}>
          <span className="train-ico">🎯</span>
          <span>
            <b>From your games</b>
            <span className="muted">{due ? `${due} mistake${due === 1 ? '' : 's'} to fix today` : 'Your own mistakes, on spaced repetition'}</span>
          </span>
        </button>
      </div>

      {puzzles.length > 0 && (
        <div className="chip-row puzzle-sets">
          {PUZZLE_SETS.map((set) => {
            const n = puzzles.filter((p) => p.themes.some((t) => set.themes.includes(t))).length;
            return n ? (
              <a key={set.label} className="chip" href={`#/tactics?theme=${set.themes.join(',')}&title=${encodeURIComponent(set.label)}`}>
                🧩 {set.label} <span className="faint">{n}</span>
              </a>
            ) : null;
          })}
        </div>
      )}

      {focus && (
        <div className="focus-card">
          <div className="coach-label">Recommended for you</div>
          <p>
            In your last {focus.games} reviewed game{focus.games === 1 ? '' : 's'}, <b>{focus.title.toLowerCase()}</b> cost you {focus.count} time
            {focus.count === 1 ? '' : 's'}.
          </p>
          <div className="row">
            <button className="btn primary small" onClick={() => navigate(`/learn/${focus.lesson.id}`)}>
              {focus.lesson.icon} Lesson: {focus.lesson.title}
            </button>
            {focus.lesson.themes.length > 0 && (
              <button className="btn small" onClick={() => navigate(`/tactics?lesson=${focus.lesson.id}`)}>
                🧩 Practise
              </button>
            )}
          </div>
        </div>
      )}

      {LESSON_GROUPS.map((group) => (
        <section key={group} className="lesson-group">
          <h2>{group}</h2>
          <div className="lesson-grid">
            {LESSONS.filter((l) => l.group === group).map((l) => {
              const p = lessons[l.id];
              const pct = p?.done ? 100 : p ? Math.round(((p.step + 1) / l.steps.length) * 100) : 0;
              const n = countFor(l);
              return (
                <a key={l.id} className={`lesson-card ${p?.done ? 'done' : ''}`} href={`#/learn/${l.id}`}>
                  <span className="lesson-card-ico">{l.icon}</span>
                  <span className="lesson-card-body">
                    <b>
                      {l.title} {p?.done && <span className="tick">✓</span>}
                    </b>
                    <span className="muted">{l.summary}</span>
                    <span className="lesson-meter">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    {n > 0 && (
                      <span className="faint lesson-card-foot">
                        🧩 {n} puzzle{n === 1 ? '' : 's'}
                        {solvedFor(l) ? ` · ${solvedFor(l)} solved` : ''}
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
