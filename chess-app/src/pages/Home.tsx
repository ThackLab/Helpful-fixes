import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../lib/router';
import { listPuzzles, onDbChange } from '../lib/storage/db';
import { useProfile } from '../state/profile';
import { useLiveGame } from '../state/game';
import { findBot } from '../lib/bots/bots';
import { GameRow, useGames, userOutcome } from './Games';

function Sparkline({ values, width = 260, height = 56 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2)
    return (
      <div className="faint" style={{ fontSize: '0.85rem' }}>
        Play a few rated bot games to see your rating graph.
      </div>
    );
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / (max - min)) * height).toFixed(1)}`);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} aria-label="Rating history">
      <polyline points={pts.join(' ')} fill="none" stroke="#81b64c" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function HomePage() {
  const profile = useProfile();
  const games = useGames();
  const live = useLiveGame((s) => s.game);
  const [due, setDue] = useState(0);
  useEffect(() => {
    const load = () => listPuzzles().then((ps) => setDue(ps.filter((p) => p.due <= Date.now()).length));
    void load();
    return onDbChange(load);
  }, []);

  const stats = useMemo(() => {
    const mine = (games ?? []).filter((g) => g.userColor && g.accuracy);
    const recent = mine.slice(0, 10);
    const avgAcc = recent.length ? recent.reduce((a, g) => a + g.accuracy![g.userColor!], 0) / recent.length : null;
    const openings = new Map<string, { n: number; score: number }>();
    for (const g of games ?? []) {
      if (!g.opening || !g.userColor) continue;
      const fam = g.opening.split(':')[0];
      const o = userOutcome(g);
      const cur = openings.get(fam) ?? { n: 0, score: 0 };
      cur.n++;
      cur.score += o === 'win' ? 1 : o === 'draw' ? 0.5 : 0;
      openings.set(fam, cur);
    }
    const topOpenings = [...openings.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    return { avgAcc, topOpenings };
  }, [games]);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Your chess, reviewed properly.</h1>
          <p className="muted" style={{ fontSize: '1.05rem' }}>
            Play bots from 250 to 3200 Elo, get a full Stockfish game review with coach explanations after every game, and analyse any PGN. Everything
            runs in your browser - free, private and offline-capable.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            {live?.status === 'playing' ? (
              <button className="btn primary big" onClick={() => navigate('/game')}>
                ▶ Resume vs {findBot(live.botId)?.name}
              </button>
            ) : (
              <button className="btn primary big" onClick={() => navigate('/play')}>
                ♟️ Play a bot
              </button>
            )}
            <button className="btn big" onClick={() => navigate('/analysis')}>
              🔬 Analysis board
            </button>
          </div>
        </div>
        <div className="card">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="stat">
              <span className="k">Rating vs bots</span>
              <span className="v">{profile.rating}</span>
            </div>
            <span className="spacer" />
            <div className="stat" style={{ textAlign: 'right' }}>
              <span className="k">W / D / L</span>
              <span className="v" style={{ fontSize: '1.2rem' }}>
                {profile.wins} / {profile.draws} / {profile.losses}
              </span>
            </div>
          </div>
          <Sparkline values={profile.history.map((h) => h.rating)} />
          <div className="row" style={{ marginTop: 8 }}>
            <div className="stat">
              <span className="k">Avg accuracy (last 10)</span>
              <span className="v" style={{ fontSize: '1.2rem' }}>
                {stats.avgAcc !== null ? `${stats.avgAcc.toFixed(1)}%` : '–'}
              </span>
            </div>
            <span className="spacer" />
            <div className="stat" style={{ textAlign: 'right' }}>
              <span className="k">Practice due</span>
              <span className="v" style={{ fontSize: '1.2rem' }}>
                {due}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid-cards" style={{ marginBottom: 26 }}>
        <a className="action-card" href="#/play">
          <span className="ico">🤖</span>
          <span>
            <b>Play bots</b>
            <span className="muted">17 personalities, or any custom Elo</span>
          </span>
        </a>
        <a className="action-card" href="#/import">
          <span className="ico">📥</span>
          <span>
            <b>Review chess.com / lichess games</b>
            <span className="muted">Import by username or paste PGN</span>
          </span>
        </a>
        <a className="action-card" href="#/practice">
          <span className="ico">🎯</span>
          <span>
            <b>Learn from mistakes</b>
            <span className="muted">Your own blunders as spaced-repetition puzzles</span>
          </span>
        </a>
        <a className="action-card" href="#/analysis">
          <span className="ico">🧪</span>
          <span>
            <b>Analysis board</b>
            <span className="muted">Multi-line engine, variations, PGN/FEN</span>
          </span>
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 18 }} className="home-grid">
        <section className="card" style={{ padding: 0 }}>
          <div className="row" style={{ padding: '14px 16px 4px' }}>
            <h2 style={{ margin: 0 }}>Recent games</h2>
            <span className="spacer" />
            <a href="#/games">View all</a>
          </div>
          {games && games.length ? (
            <table className="table">
              <tbody>
                {games.slice(0, 6).map((g) => (
                  <GameRow key={g.id} g={g} compact />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No games yet - play a bot or import your games to get started.</div>
          )}
        </section>
        <section className="card">
          <h2>Your openings</h2>
          {stats.topOpenings.length ? (
            stats.topOpenings.map(([name, o]) => (
              <div key={name} className="row" style={{ padding: '5px 0', flexWrap: 'nowrap' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span className="faint">{o.n}×</span>
                <b style={{ minWidth: 44, textAlign: 'right' }}>{Math.round((o.score / o.n) * 100)}%</b>
              </div>
            ))
          ) : (
            <div className="faint">Opening statistics appear after a few games.</div>
          )}
        </section>
      </div>
      <style>{`@media (max-width: 860px) { .home-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
