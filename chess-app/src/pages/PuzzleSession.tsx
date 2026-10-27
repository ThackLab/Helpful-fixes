import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Eye, Lightbulb, X } from 'lucide-react';
import { Board } from '../components/Board';
import { useSolver } from '../components/useSolver';
import { SolverFeedback } from './Lesson';
import { findLesson } from '../lib/learn/curriculum';
import { explainPuzzle, puzzleSetup, solutionSan, type TacticPuzzle } from '../lib/learn/puzzles';
import { THEME_INFO, type PuzzleTheme } from '../lib/learn/tags';
import { sanLine } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { pickPuzzle, useLearn } from '../state/learn';
import { COLLECTIONS, THEME_SETS, usePuzzleBank } from './Puzzles';

/** Rated puzzle solving: `#/puzzles/play`, `?set=fork`, `?theme=fork,pin` or `?lesson=forks`. */
export function PuzzleSessionPage({ query }: { query: URLSearchParams }) {
  const set = THEME_SETS.find((s) => s.id === query.get('set'));
  const collection = COLLECTIONS.find((c) => c.id === query.get('collection'));
  const lesson = findLesson(query.get('lesson') ?? '');
  const themes = useMemo<PuzzleTheme[]>(
    () => set?.themes ?? lesson?.themes ?? (query.get('theme')?.split(',').filter(Boolean) as PuzzleTheme[] | undefined) ?? [],
    [set, lesson, query],
  );
  const { rating, record } = useLearn();
  const bank = usePuzzleBank();
  const all = useMemo(() => (bank && collection ? bank.filter(collection.match) : bank), [bank, collection]);
  const [puzzle, setPuzzle] = useState<TacticPuzzle | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [played, setPlayed] = useState<boolean[]>([]);

  const next = () => {
    if (!all) return;
    setDelta(null);
    setPuzzle(pickPuzzle(all, useLearn.getState().rating, useLearn.getState().recent, themes));
  };
  useEffect(() => {
    if (all && !puzzle) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  const input = useMemo(() => (puzzle ? puzzleSetup(puzzle) : null), [puzzle]);
  const solver = useSolver(input);

  // Score the attempt once: a wrong move, a hint or a revealed answer counts as a miss.
  useEffect(() => {
    if (!puzzle || delta !== null) return;
    if (solver.state === 'solved' || solver.state === 'wrong' || solver.state === 'revealed') {
      const ok = solver.state === 'solved' && !solver.failed && solver.hintLevel === 0;
      setDelta(record(puzzle, ok));
      setStreak((s) => (ok ? s + 1 : 0));
      setPlayed((p) => [...p, ok].slice(-20));
    }
  }, [solver.state, solver.failed, solver.hintLevel, puzzle, delta, record]);

  const title = collection?.title ?? set?.title ?? lesson?.title ?? (themes.length === 1 ? THEME_INFO[themes[0]].title : 'Puzzles');
  const side = solver.solver === 'b' ? 'Black' : 'White';
  const done = solver.state === 'solved' || solver.state === 'revealed';
  const clean = solver.state === 'solved' && !solver.failed && solver.hintLevel === 0;
  const lastSan = puzzle && !puzzle.noPrev ? sanLine(puzzle.fen, [puzzle.moves[0]])[0] : '';

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="player-bar lesson-top">
          <button className="icon-btn" onClick={() => navigate('/puzzles')} aria-label="Close">
            <X size={22} />
          </button>
          <b>{title}</b>
          <span className="spacer" />
          {streak > 1 && <span className="pill gold">🔥 {streak}</span>}
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
          {(solver.state === 'wrong' || (solver.state === 'solved' && clean)) && (
            <span className={`board-flash ${solver.state === 'wrong' ? 'wrong' : 'right'}`}>
              {solver.state === 'wrong' ? <X size={26} /> : <Check size={26} />}
            </span>
          )}
        </div>
      </div>

      <div className="side-panel">
        <div className="panel-body">
          {all && !all.length ? (
            <div className="coach-card">
              <h3 className="coach-title">No puzzles yet</h3>
              <p className="coach-text">The puzzle collection didn’t load. Restart the app and try again.</p>
            </div>
          ) : all && !puzzle ? (
            <div className="coach-card">
              <h3 className="coach-title">No puzzles for this theme yet</h3>
              <button className="btn primary" onClick={() => navigate('/puzzles/play')}>
                Rated puzzles
              </button>
            </div>
          ) : puzzle ? (
            <div className={`coach-card ${done ? (clean ? 'good' : '') : solver.state === 'wrong' ? 'bad' : ''}`}>
              <div className="coach-top">
                <span className="coach-step">
                  {puzzle.rating}
                  {puzzle.source ? ` · ${puzzle.source}` : ''}
                </span>
                {played.length > 0 && (
                  <span className="result-dots">
                    {played.slice(-10).map((ok, i) => (
                      <span key={i} className={ok ? 'ok' : 'bad'} />
                    ))}
                  </span>
                )}
              </div>
              <h3 className={`coach-title ${clean ? 'good-text' : ''}`}>
                {done ? (solver.state === 'solved' ? (clean ? 'Correct!' : 'Solved') : 'Solution') : `${side} to move`}
              </h3>
              {!done && solver.state !== 'wrong' && (
                <p className="coach-text">
                  {lastSan ? (
                    <>
                      {side === 'White' ? 'Black' : 'White'} just played <b>{lastSan}</b>. Find the best reply.
                    </>
                  ) : (
                    'Find the best move.'
                  )}
                </p>
              )}
              <SolverFeedback solver={solver} success={explainPuzzle(puzzle)} showReveal={false} showResult={false} />
              {done && (
                <>
                  <p className="coach-line">{solutionSan(puzzle)}</p>
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
          <button className="ctl" onClick={solver.hint} disabled={solver.state !== 'solve' || solver.hintLevel >= 2}>
            <span className="ctl-ico">
              <Lightbulb size={20} />
            </span>
            <span className="ctl-label">Hint</span>
          </button>
          <button className="ctl" onClick={() => void solver.reveal()} disabled={done || !puzzle}>
            <span className="ctl-ico">
              <Eye size={20} />
            </span>
            <span className="ctl-label">Solution</span>
          </button>
          <button className={`ctl wide ${done ? 'go' : ''}`} onClick={next} disabled={!all?.length}>
            <span className="ctl-ico">
              <ChevronRight size={22} />
            </span>
            <span className="ctl-label">{done ? 'Next puzzle' : 'Skip'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
