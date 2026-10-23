import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from './components/Widgets';
import { navigate, useRoute } from './lib/router';
import { listPuzzles, onDbChange } from './lib/storage/db';
import { loadOpeningBook } from './lib/chess/openings';
import { useLiveGame } from './state/game';
import { HomePage } from './pages/Home';
import { PlayPage } from './pages/Play';
import { GamePage } from './pages/Game';
import { ReviewPage } from './pages/Review';
import { AnalysisPage } from './pages/Analysis';
import { GamesPage } from './pages/Games';
import { PracticePage } from './pages/Practice';
import { ImportPage } from './pages/Import';
import { SettingsPage } from './pages/Settings';

const NAV: { path: string; label: string; icon: string; match: (p: string) => boolean }[] = [
  { path: '/', label: 'Home', icon: '🏠', match: (p) => p === '/' },
  { path: '/play', label: 'Play', icon: '♟️', match: (p) => p.startsWith('/play') || p.startsWith('/game') },
  { path: '/analysis', label: 'Analysis', icon: '🔬', match: (p) => p.startsWith('/analysis') },
  { path: '/games', label: 'Games', icon: '📚', match: (p) => p.startsWith('/games') || p.startsWith('/review') },
  { path: '/practice', label: 'Practice', icon: '🎯', match: (p) => p.startsWith('/practice') },
  { path: '/import', label: 'Import', icon: '📥', match: (p) => p.startsWith('/import') },
  { path: '/settings', label: 'Settings', icon: '⚙️', match: (p) => p.startsWith('/settings') },
];

function useDuePuzzles() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => listPuzzles().then((ps) => setN(ps.filter((p) => p.due <= Date.now()).length));
    void load();
    return onDbChange(load);
  }, []);
  return n;
}

export function App() {
  const route = useRoute();
  const due = useDuePuzzles();
  const live = useLiveGame((s) => s.game);
  useEffect(() => {
    void loadOpeningBook();
  }, []);

  let page: ReactNode;
  const [root, id] = route.parts;
  switch (root) {
    case undefined:
      page = <HomePage />;
      break;
    case 'play':
      page = <PlayPage key={route.query.get('fen') ?? ''} initialFen={route.query.get('fen') ?? undefined} />;
      break;
    case 'game':
      page = <GamePage />;
      break;
    case 'review':
      page = <ReviewPage key={id} gameId={id} />;
      break;
    case 'analysis':
      page = <AnalysisPage key={route.query.get('game') ?? route.query.get('fen') ?? 'board'} query={route.query} />;
      break;
    case 'games':
      page = <GamesPage />;
      break;
    case 'practice':
      page = <PracticePage />;
      break;
    case 'import':
      page = <ImportPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = (
        <div className="page empty">
          <h2>Page not found</h2>
          <button className="btn primary" onClick={() => navigate('/')}>
            Go home
          </button>
        </div>
      );
  }

  return (
    <div className={`app ${root === 'game' || root === 'review' ? 'focus' : ''}`}>
      <nav className="sidebar">
        <a className="brand" href="#/">
          <Logo /> Outpost
        </a>
        {NAV.map((n) => (
          <a
            key={n.path}
            href={`#${n.path === '/play' && live?.status === 'playing' ? '/game' : n.path}`}
            className={`nav-link ${n.match(route.path) ? 'active' : ''}`}
          >
            <span className="ico">{n.icon}</span>
            {n.label}
            {n.path === '/practice' && due > 0 && <span className="nav-badge">{due}</span>}
            {n.path === '/play' && live?.status === 'playing' && (
              <span className="nav-badge" style={{ background: 'var(--accent)' }}>
                live
              </span>
            )}
          </a>
        ))}
        <div className="sidebar-foot">
          Stockfish 18 · runs locally
          <br />
          No account, no fees.
        </div>
      </nav>
      <main className="main">{page}</main>
    </div>
  );
}
