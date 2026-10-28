import { useEffect, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { loadPuzzles, type TacticPuzzle } from '../lib/learn/puzzles';
import type { PuzzleTheme } from '../lib/learn/tags';
import { listPuzzles, onDbChange } from '../lib/storage/db';
import { navigate } from '../lib/router';
import { ListRow, PageHead, SectionTitle, Sparkline } from '../components/ui';
import { liveStreak, useLearn } from '../state/learn';
import { CountUp } from '../components/Rich';

/** Theme sets on the hub, in teaching order. */
export const THEME_SETS: { id: string; title: string; themes: PuzzleTheme[] }[] = [
  { id: 'hanging', title: 'Free pieces', themes: ['hanging'] },
  { id: 'mate1', title: 'Mate in 1', themes: ['mateIn1'] },
  { id: 'fork', title: 'Forks', themes: ['fork'] },
  { id: 'pin', title: 'Pins', themes: ['pin'] },
  { id: 'skewer', title: 'Skewers', themes: ['skewer'] },
  { id: 'discovered', title: 'Discovered attacks', themes: ['discovered', 'doubleCheck'] },
  { id: 'defender', title: 'Removing the defender', themes: ['removeDefender'] },
  { id: 'backrank', title: 'Back-rank mates', themes: ['backRankMate'] },
  { id: 'mate2', title: 'Mate in 2', themes: ['mateIn2'] },
  { id: 'sacrifice', title: 'Sacrifices', themes: ['sacrifice'] },
  { id: 'setup', title: 'Combinations', themes: ['setup'] },
  { id: 'promotion', title: 'Promotion', themes: ['promotion'] },
  { id: 'mate3', title: 'Mate in 3', themes: ['mateIn3', 'smotheredMate'] },
];

/** Puzzles grouped by where they come from. */
export const COLLECTIONS: { id: string; title: string; sub: string; match: (p: TacticPuzzle) => boolean }[] = [
  { id: 'wac', title: 'Win at Chess', sub: 'Fred Reinfeld’s classic 300 combinations', match: (p) => !!p.source?.startsWith('Win at Chess') },
  { id: 'games', title: 'From real games', sub: 'Positions from games played on Lichess', match: (p) => p.source === 'Lichess game' },
  { id: 'problems', title: 'Mate problems', sub: 'Mates in 1 to 4, some of them composed', match: (p) => !!p.source?.startsWith('Mate in') },
  {
    id: 'ecm',
    title: 'Master combinations',
    sub: 'From the Encyclopedia of Chess Middlegames',
    match: (p) => p.source === 'Encyclopedia of Chess Middlegames',
  },
  { id: 'mined', title: 'Club games', sub: 'Mistakes found in engine games, checked by Stockfish', match: (p) => !p.source },
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
    for (const c of COLLECTIONS) m.set(`c:${c.id}`, all ? all.filter(c.match).length : 0);
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
            <span className="pill">
              <Flame size={13} /> {streak} day{streak === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      />

      <section className="rating-hero">
        <span className="rh-label">Puzzle rating</span>
        <span className="big-num">
          <CountUp value={learn.rating} id="puzzle-rating" />
        </span>
        <span className="spark">{history.length > 1 ? <Sparkline values={history.slice(-40)} height={36} /> : 'Solve a few to see your trend.'}</span>
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

      <button className="btn primary big block" style={{ marginTop: 20 }} onClick={() => navigate('/puzzles/play')} disabled={!all?.length}>
        Solve puzzles
      </button>

      <div className="list" style={{ marginTop: 28 }}>
        <ListRow
          title="Puzzle Rush"
          sub="3 minutes, 3 lives, harder every puzzle"
          end={learn.rushBest ? `best ${learn.rushBest}` : undefined}
          href="/puzzles/rush"
        />
        <ListRow
          title="Your mistakes"
          sub={due ? `${due} positions from your games to fix today` : 'Positions from your reviewed games'}
          href="/practice"
        />
      </div>

      <SectionTitle>Collections</SectionTitle>
      <div className="list">
        {COLLECTIONS.filter((c) => (counts.get(`c:${c.id}`) ?? 0) > 0).map((c) => (
          <ListRow
            key={c.id}
            title={c.title}
            sub={c.sub}
            end={<span className="num">{counts.get(`c:${c.id}`)}</span>}
            href={`/puzzles/play?collection=${c.id}`}
          />
        ))}
      </div>

      <SectionTitle>Themes</SectionTitle>
      <div className="list">
        {THEME_SETS.filter((s) => (counts.get(s.id) ?? 0) > 0).map((s) => {
          const acc = accFor(s.themes);
          return (
            <ListRow
              key={s.id}
              className="theme-row"
              title={s.title}
              sub={`${counts.get(s.id)} puzzles${acc ? ` · ${acc.n} played` : ''}`}
              end={acc ? <span className="num">{Math.round(acc.pct * 100)}%</span> : undefined}
              href={`/puzzles/play?set=${s.id}`}
            />
          );
        })}
        {!all && <div className="empty">Loading puzzles…</div>}
      </div>
      <p className="faint" style={{ fontSize: '0.8rem', marginTop: 16 }}>
        {all?.length ?? '…'} puzzles. Each one has a single winning solution, checked move by move by Stockfish, and a rating measured by letting the
        bots solve it.
      </p>
    </div>
  );
}
