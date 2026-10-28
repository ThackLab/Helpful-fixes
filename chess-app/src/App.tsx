import { useEffect, useRef, type ReactNode } from 'react';
import { BookOpen, Download, GraduationCap, History, House, Menu, Microscope, Puzzle, Settings, Users } from 'lucide-react';
import { Logo } from './components/Widgets';
import { navigate, useRoute } from './lib/router';
import { loadOpeningBook } from './lib/chess/openings';
import { pruneEvals } from './lib/review/evalCache';
import { useLiveGame } from './state/game';
import { HomePage } from './pages/Home';
import { PlayHub, PlayPage } from './pages/Play';
import { GamePage } from './pages/Game';
import { ReviewPage } from './pages/Review';
import { AnalysisPage } from './pages/Analysis';
import { GamesPage } from './pages/Games';
import { PracticePage } from './pages/Practice';
import { ImportPage } from './pages/Import';
import { SettingsPage } from './pages/Settings';
import { AppearancePage } from './pages/Appearance';
import { InsightsPage } from './pages/Insights';
import { FriendBoard, FriendHome, FriendJoin } from './pages/Friend';
import { OnlineGamePage } from './pages/Online';
import { useOnlineSync } from './state/online';
import { useOpponents } from './state/opponents';
import { OpeningDrill, OpeningsPage } from './pages/Openings';
import { LearnPage } from './pages/Learn';
import { LessonPage } from './pages/Lesson';
import { PuzzlesPage } from './pages/Puzzles';
import { PuzzleSessionPage } from './pages/PuzzleSession';
import { RushPage } from './pages/Rush';
import { ExamPage } from './pages/Exam';
import { YouPage } from './pages/You';

interface Tab {
  path: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
}

const TABS: Tab[] = [
  { path: '/', label: 'Home', icon: <House size={24} fill="currentColor" />, match: (p) => p === '/' || p.startsWith('/play') || p === '/game' },
  {
    path: '/puzzles',
    label: 'Puzzles',
    icon: <Puzzle size={24} fill="currentColor" />,
    match: (p) => p.startsWith('/puzzles') || p.startsWith('/tactics'),
  },
  {
    path: '/learn',
    label: 'Learn',
    icon: <GraduationCap size={24} />,
    match: (p) => p.startsWith('/learn') || p.startsWith('/exam') || p.startsWith('/openings'),
  },
  {
    path: '/friend',
    label: 'Friends',
    icon: <Users size={24} fill="currentColor" />,
    match: (p) => p.startsWith('/friend') || p.startsWith('/online'),
  },
  {
    path: '/you',
    label: 'More',
    icon: <Menu size={24} />,
    match: (p) =>
      ['/you', '/games', '/review', '/analysis', '/import', '/settings', '/practice', '/appearance', '/insights'].some((x) => p.startsWith(x)),
  },
];

const TOOLS: Tab[] = [
  { path: '/games', label: 'Games', icon: <History size={20} />, match: (p) => p.startsWith('/games') || p.startsWith('/review') },
  { path: '/analysis', label: 'Analysis', icon: <Microscope size={20} />, match: (p) => p.startsWith('/analysis') },
  { path: '/practice', label: 'Your mistakes', icon: <BookOpen size={20} />, match: (p) => p.startsWith('/practice') },
  { path: '/import', label: 'Import', icon: <Download size={20} />, match: (p) => p.startsWith('/import') },
  { path: '/settings', label: 'Settings', icon: <Settings size={20} />, match: (p) => p.startsWith('/settings') },
];

/** Board screens take the whole phone screen (no tab bar). */
function isFocus(parts: string[]): boolean {
  const [root, id] = parts;
  if (root === 'game' || root === 'review' || root === 'tactics' || root === 'exam') return true;
  if (root === 'friend' && id && id !== 'join') return true;
  if (root === 'online' && id) return true;
  if (root === 'openings' && id) return true;
  if (root === 'learn' && id) return true;
  if (root === 'puzzles' && id) return true;
  return false;
}

export function App() {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  // Each screen opens at the top, not wherever the previous one was scrolled to.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [route.path]);
  const live = useLiveGame((s) => s.game);
  useOnlineSync();
  const yourMoves = useOpponents().filter((o) => o.yourMove).length;
  useEffect(() => {
    void loadOpeningBook();
    // Old background evaluations are only kept for a month.
    setTimeout(() => void pruneEvals(), 5000);
  }, []);

  let page: ReactNode;
  const [root, id] = route.parts;
  switch (root) {
    case undefined:
      page = <HomePage />;
      break;
    case 'play':
      page =
        id === 'custom' || route.query.get('fen') ? (
          <PlayPage key={route.query.get('fen') ?? ''} initialFen={route.query.get('fen') ?? undefined} />
        ) : (
          <PlayHub />
        );
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
    case 'learn':
      page = id ? <LessonPage key={id} id={id} courseId={route.query.get('course')} /> : <LearnPage />;
      break;
    case 'exam':
      page = <ExamPage key={id} levelId={id ?? 'placement'} />;
      break;
    case 'puzzles':
      page = id === 'rush' ? <RushPage /> : id === 'play' ? <PuzzleSessionPage key={route.query.toString()} query={route.query} /> : <PuzzlesPage />;
      break;
    case 'tactics':
      page = <PuzzleSessionPage key={route.query.toString()} query={route.query} />;
      break;
    case 'you':
      page = <YouPage />;
      break;
    case 'import':
      page = <ImportPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    case 'appearance':
      page = <AppearancePage />;
      break;
    case 'insights':
      page = <InsightsPage />;
      break;
    case 'openings':
      page = id ? <OpeningDrill key={id} id={id} /> : <OpeningsPage />;
      break;
    case 'online':
      page = id ? <OnlineGamePage key={id} code={id} autoJoin={route.query.get('accept') === '1'} /> : <FriendHome />;
      break;
    case 'friend':
      page = id === 'join' ? <FriendJoin d={route.query.get('d')} /> : id ? <FriendBoard key={id} id={id} /> : <FriendHome />;
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

  const href = (t: Tab) => `#${t.path}`;
  return (
    <div className={`app ${isFocus(route.parts) ? 'focus' : ''}`}>
      <nav className="sidebar">
        <a className="brand" href="#/">
          <Logo /> Outpost
        </a>
        {TABS.map((t) => (
          <a key={t.path} href={href(t)} className={`nav-link ${t.match(route.path) && !TOOLS.some((x) => x.match(route.path)) ? 'active' : ''}`}>
            <span className="ico">{t.icon}</span>
            {t.label}
            {t.path === '/' && live?.status === 'playing' && <span className="nav-badge">live</span>}
          </a>
        ))}
        <div className="nav-sep">Tools</div>
        {TOOLS.map((t) => (
          <a key={t.path} href={`#${t.path}`} className={`nav-link ${t.match(route.path) ? 'active' : ''}`}>
            <span className="ico">{t.icon}</span>
            {t.label}
          </a>
        ))}
        <div className="sidebar-foot">Stockfish 18 · runs on your device</div>
      </nav>
      <main className="main" ref={main}>
        {page}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <a key={t.path} href={href(t)} className={`tab ${t.match(route.path) ? 'active' : ''}`}>
            {t.icon}
            {t.label}
            {((t.path === '/' && live?.status === 'playing') || (t.path === '/friend' && yourMoves > 0)) && <span className="tab-dot" />}
          </a>
        ))}
      </nav>
    </div>
  );
}
