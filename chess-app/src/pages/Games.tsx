import { useEffect, useMemo, useState } from 'react';
import { deleteGame, listGames, onDbChange, type GameRecord } from '../lib/storage/db';
import { navigate } from '../lib/router';
import { Segmented } from '../components/Widgets';
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
  return <span className={`result-chip ${o}`}>{o === 'win' ? '+' : o === 'loss' ? '−' : '='}</span>;
}

export function GameRow({ g, compact }: { g: GameRecord; compact?: boolean }) {
  const job = useReviewer((s) => s.jobs[g.id]);
  const date = new Date(g.createdAt);
  const userAcc = g.accuracy && g.userColor ? g.accuracy[g.userColor] : undefined;
  return (
    <tr className="click" onClick={() => navigate(`/review/${g.id}`)}>
      <td>
        <ResultChip g={g} />
      </td>
      <td>
        <div style={{ fontWeight: 700 }}>
          {g.white.name} <span className="faint">{g.white.elo ? `(${g.white.elo})` : ''}</span>
        </div>
        <div style={{ fontWeight: 700 }}>
          {g.black.name} <span className="faint">{g.black.elo ? `(${g.black.elo})` : ''}</span>
        </div>
      </td>
      {!compact && (
        <td className="muted" style={{ fontSize: '0.85rem', maxWidth: 260 }}>
          {g.opening ?? '–'}
          <div className="faint">
            {g.termination ? `${g.result} · ${g.termination}` : g.result} · {Math.ceil(g.moves.length / 2)} moves
          </div>
        </td>
      )}
      <td>
        {job?.status === 'running' ? (
          <span className="faint">{Math.round((job.done / job.total) * 100)}%</span>
        ) : g.accuracy ? (
          <div style={{ fontSize: '0.85rem' }}>
            {userAcc !== undefined ? (
              <b>{userAcc.toFixed(1)}%</b>
            ) : (
              <>
                <b>{g.accuracy.w.toFixed(0)}</b> / <b>{g.accuracy.b.toFixed(0)}</b>
              </>
            )}
          </div>
        ) : (
          <span className="faint">–</span>
        )}
      </td>
      {!compact && (
        <td className="faint" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
          {date.toLocaleDateString()}
          <div>{g.source === 'bot' ? 'vs bot' : g.source}</div>
        </td>
      )}
      {!compact && (
        <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
          <button className="icon-btn" title="Analysis board" onClick={() => navigate(`/analysis?game=${g.id}`)}>
            🔬
          </button>
          <button
            className="icon-btn"
            title="Delete"
            onClick={() => {
              if (confirm('Delete this game and its review?')) void deleteGame(g.id);
            }}
          >
            🗑
          </button>
        </td>
      )}
    </tr>
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
    <div className="page">
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Games</h1>
        <button className="btn small" onClick={() => navigate('/import')}>
          📥 Import
        </button>
        <span className="spacer" />
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
        <div className="row card" style={{ marginBottom: 12, padding: 10 }}>
          <span className="muted">{unreviewed} game(s) not reviewed yet.</span>
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
            <button className="btn primary" onClick={() => navigate('/play')}>
              Play a bot
            </button>
            <button className="btn" onClick={() => navigate('/import')}>
              Import games
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>Players</th>
                <th>Opening</th>
                <th>Accuracy</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((g) => (
                <GameRow key={g.id} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
