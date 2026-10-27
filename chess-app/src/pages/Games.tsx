import { useEffect, useMemo, useState } from 'react';
import { Download, Microscope, Trash2 } from 'lucide-react';
import { deleteGame, listGames, onDbChange, type GameRecord } from '../lib/storage/db';
import { findBot } from '../lib/bots/bots';
import { navigate } from '../lib/router';
import { Segmented } from '../components/Widgets';
import { PageHead } from '../components/ui';
import { useReviewer } from '../state/reviewer';

export function useGames() {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  useEffect(() => {
    const load = () => listGames().then(setGames);
    void load();
    return onDbChange(load);
  }, []);
  return games;
}

export function userOutcome(g: GameRecord): 'win' | 'loss' | 'draw' | null {
  if (g.result === '*') return null;
  if (g.result === '1/2-1/2') return 'draw';
  if (!g.userColor) return null;
  return (g.result === '1-0') === (g.userColor === 'w') ? 'win' : 'loss';
}

export function ResultChip({ g }: { g: GameRecord }) {
  const o = userOutcome(g);
  if (!o) return <span className="tag">{g.result}</span>;
  return <span className={`result-chip ${o}`}>{o === 'win' ? 'W' : o === 'loss' ? 'L' : '½'}</span>;
}

function when(t: number): string {
  const d = Date.now() - t;
  if (d < 3_600_000) return `${Math.max(1, Math.round(d / 60_000))} min ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} h ago`;
  if (d < 7 * 86_400_000) return `${Math.round(d / 86_400_000)} d ago`;
  return new Date(t).toLocaleDateString();
}

/** One game in a list: opponent, result, accuracy, when. Opens the review. */
export function GameListRow({ g, actions }: { g: GameRecord; actions?: boolean }) {
  const job = useReviewer((s) => s.jobs[g.id]);
  const opp = g.userColor ? (g.userColor === 'w' ? g.black : g.white) : null;
  const bot = opp?.botId ? findBot(opp.botId) : undefined;
  const userAcc = g.accuracy && g.userColor ? g.accuracy[g.userColor] : undefined;
  const title = opp ? `vs ${opp.name}${opp.elo ? ` (${opp.elo})` : ''}` : `${g.white.name} – ${g.black.name}`;
  return (
    <div
      className="game-row"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/review/${g.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/review/${g.id}`)}
    >
      <ResultChip g={g} />
      {bot && (
        <span className="avatar" style={{ background: bot.tint, width: 34, height: 34, fontSize: '1.2rem', borderRadius: 9 }}>
          {bot.avatar}
        </span>
      )}
      <span className="gr-body">
        <span className="gr-title">{title}</span>
        <span className="gr-sub">
          {g.opening ? `${g.opening} · ` : ''}
          {Math.ceil(g.moves.length / 2)} moves · {when(g.createdAt)}
        </span>
      </span>
      {job?.status === 'running' ? (
        <span className="pill">{Math.round((job.done / job.total) * 100)}%</span>
      ) : userAcc !== undefined ? (
        <span className="pill accent">{userAcc.toFixed(0)}%</span>
      ) : g.accuracy ? (
        <span className="pill">
          {g.accuracy.w.toFixed(0)} / {g.accuracy.b.toFixed(0)}
        </span>
      ) : (
        <span className="pill">Review</span>
      )}
      {actions && (
        <span className="row" style={{ gap: 0, flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="Analysis board" onClick={() => navigate(`/analysis?game=${g.id}`)}>
            <Microscope size={18} />
          </button>
          <button
            className="icon-btn"
            title="Delete"
            onClick={() => {
              if (confirm('Delete this game and its review?')) void deleteGame(g.id);
            }}
          >
            <Trash2 size={18} />
          </button>
        </span>
      )}
    </div>
  );
}

export function GamesPage() {
  const games = useGames();
  const [filter, setFilter] = useState<'all' | 'bot' | 'import' | 'other'>('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (!games) return [];
    return games.filter((g) => {
      if (filter === 'bot' && g.source !== 'bot') return false;
      if (filter === 'import' && g.source !== 'import') return false;
      if (filter === 'other' && (g.source === 'bot' || g.source === 'import')) return false;
      if (q) {
        const hay = `${g.white.name} ${g.black.name} ${g.opening ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [games, filter, q]);
  const unreviewed = list.filter((g) => !g.accuracy).length;

  return (
    <div className="page narrow">
      <PageHead
        title="Games"
        back="/you"
        right={
          <button className="btn small" onClick={() => navigate('/import')}>
            <Download size={16} /> Import
          </button>
        }
      />
      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <input placeholder="Search players or openings" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'bot', label: 'vs Bots' },
            { value: 'import', label: 'Imported' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </div>
      {unreviewed > 0 && (
        <div className="row card" style={{ marginBottom: 12, padding: 12 }}>
          <span className="muted">
            {unreviewed} game{unreviewed === 1 ? '' : 's'} not reviewed yet.
          </span>
          <span className="spacer" />
          <button
            className="btn small"
            onClick={async () => {
              for (const g of list.filter((x) => !x.accuracy).slice(0, 20)) await useReviewer.getState().start(g.id);
            }}
          >
            Review them all
          </button>
        </div>
      )}
      {games === null ? (
        <div className="muted">Loading…</div>
      ) : list.length === 0 ? (
        <div className="empty card">
          <p>No games yet.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => navigate('/')}>
              Play a bot
            </button>
            <button className="btn" onClick={() => navigate('/import')}>
              Import games
            </button>
          </div>
        </div>
      ) : (
        <div className="list game-rows">
          {list.map((g) => (
            <GameListRow key={g.id} g={g} actions />
          ))}
        </div>
      )}
    </div>
  );
}
