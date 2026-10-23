import { useEffect, useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { useSolver } from '../components/useSolver';
import { SolverFeedback } from './Lesson';
import { findLesson } from '../lib/learn/curriculum';
import { explainPuzzle, loadPuzzles, type TacticPuzzle } from '../lib/learn/puzzles';
import { THEME_INFO, type PuzzleTheme } from '../lib/learn/tags';
import { sanLine } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { pickPuzzle, useLearn } from '../state/learn';

/** Themed puzzle trainer: `#/tactics`, `#/tactics?theme=fork,pin` or `#/tactics?lesson=forks`. */
export function TacticsPage({ query }: { query: URLSearchParams }) {
  const lesson = findLesson(query.get('lesson') ?? '');
  const themes = useMemo(
    () => (lesson ? lesson.themes : ((query.get('theme')?.split(',').filter(Boolean) as PuzzleTheme[] | undefined) ?? [])),
    [lesson, query],
  );
  const { rating, record } = useLearn();
  const [all, setAll] = useState<TacticPuzzle[] | null>(null);
  const [puzzle, setPuzzle] = useState<TacticPuzzle | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    void loadPuzzles().then(setAll);
  }, []);
  const next = () => {
    if (!all) return;
    setDelta(null);
    setPuzzle(pickPuzzle(all, useLearn.getState().rating, useLearn.getState().recent, themes));
  };
  useEffect(() => {
    if (all && !puzzle) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  const input = useMemo(() => (puzzle ? { fen: puzzle.fen, startMove: puzzle.moves[0], line: puzzle.moves.slice(1) } : null), [puzzle]);
  const solver = useSolver(input);

  // Score the attempt once: a wrong move or a revealed answer counts as a miss.
  useEffect(() => {
    if (!puzzle || delta !== null) return;
    if (solver.state === 'solved' || solver.state === 'wrong' || solver.state === 'revealed') {
      const ok = solver.state === 'solved' && !solver.failed;
      setDelta(record(puzzle, ok));
      setStreak((s) => (ok ? s + 1 : 0));
    }
  }, [solver.state, solver.failed, puzzle, delta, record]);

  const title = lesson ? lesson.title : themes.length === 1 ? THEME_INFO[themes[0]].title : 'Mixed tactics';
  const side = solver.solver === 'b' ? 'Black' : 'White';
  const done = solver.state === 'solved' || solver.state === 'revealed';
  const lastSan = puzzle ? sanLine(puzzle.fen, [puzzle.moves[0]])[0] : '';

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="player-bar lesson-top">
          <b>🧩 {title}</b>
          <span className="spacer" />
          {streak > 1 && <span className="faint">🔥 {streak}</span>}
          <span className="rating-chip">
            {rating}
            {delta !== null && <em className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? `+${delta}` : delta}</em>}
          </span>
        </div>
        <div className="board-row">
          {solver.view ? (
            <Board
              fen={solver.view.fen}
              orientation={solver.solver === 'b' ? 'black' : 'white'}
              lastMove={solver.view.lastMove}
              check={solver.view.check}
              highlights={solver.highlights}
              movableColor={solver.state === 'solve' && solver.solver ? (solver.solver === 'w' ? 'white' : 'black') : undefined}
              dests={solver.dests}
              onMove={solver.onMove}
            />
          ) : (
            <div className="board-placeholder" />
          )}
        </div>
      </div>

      <div className="side-panel">
        <div className="panel-body">
          {all && !all.length ? (
            <div className="coach-card">
              <h3 className="coach-title">No puzzles yet</h3>
              <p className="coach-text">The puzzle collection didn’t load. Check your connection and try again.</p>
            </div>
          ) : all && !puzzle ? (
            <div className="coach-card">
              <h3 className="coach-title">No puzzles for this theme yet</h3>
              <button className="btn primary" onClick={() => navigate('/tactics')}>
                Mixed tactics
              </button>
            </div>
          ) : puzzle ? (
            <div className="coach-card">
              <div className="coach-top">
                <span className="coach-step">Puzzle · {puzzle.rating}</span>
              </div>
              <h3 className={`coach-title ${solver.state === 'solved' ? 'good-text' : ''}`}>
                {done
                  ? solver.state === 'solved'
                    ? solver.failed
                      ? '✅ Solved'
                      : '✅ Correct!'
                    : '💡 Solution'
                  : `Find the best move for ${side}`}
              </h3>
              {!done && (
                <p className="coach-text">
                  {side === 'White' ? 'Black' : 'White'} just played <b>{lastSan}</b>. How do you punish it?
                </p>
              )}
              <SolverFeedback solver={solver} success={explainPuzzle(puzzle)} showReveal={false} showResult={false} />
              {done && (
                <>
                  <p className="coach-line">{sanLine(puzzle.fen, puzzle.moves).slice(1).join(' ')}</p>
                  <div className="chip-row">
                    {puzzle.themes.map((t) => {
                      const info = THEME_INFO[t];
                      return info.lesson ? (
                        <a key={t} className="chip" href={`#/learn/${info.lesson}`}>
                          {info.title} · lesson
                        </a>
                      ) : (
                        <span key={t} className="chip">
                          {info.title}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="faint">Loading puzzles…</p>
          )}
        </div>

        <div className="play-controls">
          <button className="ctl" onClick={() => navigate('/learn')}>
            <span className="ctl-ico">✕</span>
            <span className="ctl-label">Close</span>
          </button>
          <button className="ctl" onClick={solver.hint} disabled={solver.state !== 'solve' || solver.hintLevel >= 2}>
            <span className="ctl-ico">💡</span>
            <span className="ctl-label">Hint</span>
          </button>
          <button className="ctl" onClick={() => void solver.reveal()} disabled={done || !puzzle}>
            <span className="ctl-ico">👁</span>
            <span className="ctl-label">Solution</span>
          </button>
          <button className="ctl wide" onClick={next} disabled={!all?.length}>
            <span className="ctl-ico">▶</span>
            <span className="ctl-label">{done ? 'Next puzzle' : 'Skip'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
