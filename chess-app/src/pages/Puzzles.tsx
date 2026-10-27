import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Flame, Play, Timer } from 'lucide-react';
import { loadPuzzles, type TacticPuzzle } from '../lib/learn/puzzles';
import type { PuzzleTheme } from '../lib/learn/tags';
import { listPuzzles, onDbChange } from '../lib/storage/db';
import { navigate } from '../lib/router';
import { ListRow, Meter, PageHead, SectionTitle, Sparkline } from '../components/ui';
import { liveStreak, useLearn } from '../state/learn';

/** Theme sets on the hub, in teaching order. */
export const THEME_SETS: { id: string; title: string; icon: string; themes: PuzzleTheme[] }[] = [
  { id: 'hanging', title: 'Free pieces', icon: '🎁', themes: ['hanging'] },
  { id: 'mate1', title: 'Mate in 1', icon: '♚', themes: ['mateIn1'] },
  { id: 'fork', title: 'Forks', icon: '🍴', themes: ['fork'] },
  { id: 'pin', title: 'Pins', icon: '📌', themes: ['pin'] },
  { id: 'skewer', title: 'Skewers', icon: '🍢', themes: ['skewer'] },
  { id: 'discovered', title: 'Discovered attacks', icon: '💥', themes: ['discovered', 'doubleCheck'] },
  { id: 'defender', title: 'Removing the defender', icon: '🛡️', themes: ['removeDefender'] },
  { id: 'backrank', title: 'Back-rank mates', icon: '🏰', themes: ['backRankMate'] },
  { id: 'mate2', title: 'Mate in 2', icon: '♛', themes: ['mateIn2'] },
  { id: 'sacrifice', title: 'Sacrifices', icon: '🔥', themes: ['sacrifice'] },
  { id: 'setup', title: 'Combinations', icon: '🧠', themes: ['setup'] },
  { id: 'promotion', title: 'Promotion', icon: '👑', themes: ['promotion'] },
  { id: 'mate3', title: 'Mate in 3', icon: '♜', themes: ['mateIn3', 'smotheredMate'] },
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

export function usePuzzleBank() {
  const [all, setAll] = useState<TacticPuzzle[] | null>(null);
  useEffect(() => {
    void loadPuzzles().then(setAll);
  }, []);
  return all;
}

export function PuzzlesPage() {
  const learn = useLearn();
  const all = usePuzzleBank();
  const due = useDueCount();
  const streak = liveStreak(learn);
  const accuracy = learn.attempts ? Math.round((learn.solved / learn.attempts) * 100) : null;
  const history = learn.ratingHistory.map((h) => h.r);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const set of THEME_SETS) m.set(set.id, all ? all.filter((p) => p.themes.some((t) => set.themes.includes(t))).length : 0);
    return m;
  }, [all]);
  const accFor = (themes: PuzzleTheme[]) => {
    let ok = 0;
    let fail = 0;
    for (const t of themes) {
      ok += learn.themes[t]?.ok ?? 0;
      fail += learn.themes[t]?.fail ?? 0;
    }
    return ok + fail ? { pct: ok / (ok + fail), n: ok + fail } : null;
  };

  return (
    <div className="page narrow">
      <PageHead
        title="Puzzles"
        right={
          streak > 0 ? (
            <span className="pill gold">
              <Flame size={14} /> {streak} day{streak === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      />

      <section className="rating-hero">
        <span className="rh-label">Puzzle rating</span>
        <span className="big-num">{learn.rating}</span>
        <span className="spark">
          {history.length > 1 ? <Sparkline values={history.slice(-40)} /> : <span className="faint">Solve a few to see your trend.</span>}
        </span>
        <div className="stats-row">
          <div className="stat">
            <span className="k">Solved</span>
            <span className="v">{learn.solved}</span>
          </div>
          <div className="stat">
            <span className="k">Accuracy</span>
            <span className="v">{accuracy !== null ? `${accuracy}%` : '–'}</span>
          </div>
          <div className="stat">
            <span className="k">Best rush</span>
            <span className="v">{learn.rushBest || '–'}</span>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <button className="btn primary big block" onClick={() => navigate('/puzzles/play')} disabled={!all?.length}>
          <Play size={20} fill="currentColor" /> Solve rated puzzles
        </button>
        <div className="grid-2">
          <button className="tile" onClick={() => navigate('/puzzles/rush')} disabled={!all?.length}>
            <span className="tile-ico ico-gold">
              <Timer size={22} />
            </span>
            <b>Puzzle Rush</b>
            <span className="tile-sub">3 minutes, 3 lives</span>
          </button>
          <button className="tile" onClick={() => navigate('/practice')}>
            <span className="tile-ico ico-danger">
              <BookOpen size={22} />
            </span>
            <b>Your mistakes</b>
            <span className="tile-sub">{due ? `${due} to fix today` : 'From your reviewed games'}</span>
          </button>
        </div>
      </div>

      <SectionTitle>Train a theme</SectionTitle>
      <div className="list">
        {THEME_SETS.filter((s) => (counts.get(s.id) ?? 0) > 0).map((s) => {
          const acc = accFor(s.themes);
          return (
            <ListRow
              key={s.id}
              className="theme-row"
              icon={s.icon}
              title={s.title}
              sub={`${counts.get(s.id)} puzzles${acc ? ` · ${acc.n} played` : ''}`}
              end={acc ? <Meter value={acc.pct} /> : <span className="faint">New</span>}
              href={`/puzzles/play?set=${s.id}`}
            />
          );
        })}
        {!all && <div className="empty">Loading puzzles…</div>}
      </div>
      <p className="faint" style={{ fontSize: '0.8rem', marginTop: 12 }}>
        {all?.length ?? '…'} puzzles. Each one has a single winning solution, checked move by move by Stockfish.
      </p>
    </div>
  );
}
