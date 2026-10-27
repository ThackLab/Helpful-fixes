import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Heart, Play, RotateCcw, Timer, X } from 'lucide-react';
import { Board } from '../components/Board';
import { useSolver } from '../components/useSolver';
import { puzzleSetup, type TacticPuzzle } from '../lib/learn/puzzles';
import { navigate } from '../lib/router';
import { playSound } from '../lib/sound';
import { useLearn } from '../state/learn';
import { usePuzzleBank } from './Puzzles';

const DURATION = 180_000;
const LIVES = 3;

/** The next puzzle of a run: each one a little harder than the last. */
function rushPuzzle(all: TacticPuzzle[], index: number, used: Set<string>): TacticPuzzle | null {
  const target = Math.min(2000, 200 + index * 45);
  for (const width of [100, 200, 400, 2000]) {
    const pool = all.filter((p) => !used.has(p.id) && Math.abs(p.rating - target) <= width);
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return null;
}

export function RushPage() {
  const all = usePuzzleBank();
  const { rushBest, recordRush } = useLearn();
  const [phase, setPhase] = useState<'intro' | 'running' | 'over'>('intro');
  const [results, setResults] = useState<boolean[]>([]);
  const [puzzle, setPuzzle] = useState<TacticPuzzle | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [newBest, setNewBest] = useState(false);
  const used = useRef(new Set<string>());
  const handled = useRef<TacticPuzzle | null>(null);

  const score = results.filter(Boolean).length;
  const strikes = results.filter((r) => !r).length;
  const left = Math.max(0, endsAt - now);

  const input = useMemo(() => (puzzle ? { ...puzzleSetup(puzzle), strict: true } : null), [puzzle]);
  const solver = useSolver(phase === 'running' ? input : null);

  const advance = (res: boolean[]) => {
    if (!all) return;
    const p = rushPuzzle(all, res.length, used.current);
    if (p) used.current.add(p.id);
    setPuzzle(p);
  };

  const start = () => {
    used.current = new Set();
    handled.current = null;
    setResults([]);
    setNewBest(false);
    setEndsAt(Date.now() + DURATION);
    setNow(Date.now());
    setPhase('running');
    advance([]);
  };

  const finish = (res: boolean[]) => {
    setPhase('over');
    setNewBest(recordRush(res.filter(Boolean).length));
    playSound('end');
  };

  // The clock.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'running' && left <= 0) finish(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase]);

  // A solved or failed puzzle moves the run on.
  useEffect(() => {
    if (phase !== 'running' || !puzzle || handled.current === puzzle) return;
    if (solver.state !== 'solved' && solver.state !== 'wrong') return;
    handled.current = puzzle;
    const ok = solver.state === 'solved';
    const res = [...results, ok];
    setResults(res);
    const t = setTimeout(
      () => {
        if (!ok && res.filter((r) => !r).length >= LIVES) finish(res);
        else advance(res);
      },
      ok ? 350 : 900,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solver.state, puzzle, phase]);

  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="rush-bar">
          <button className="icon-btn" onClick={() => navigate('/puzzles')} aria-label="Close">
            <X size={22} />
          </button>
          {phase === 'running' ? (
            <>
              <span className={`rush-clock ${left < 20_000 ? 'low' : ''}`}>
                {mm}:{String(ss).padStart(2, '0')}
              </span>
              <span className="spacer" />
              <span className="strikes" aria-label={`${LIVES - strikes} lives left`}>
                {Array.from({ length: LIVES }, (_, i) => (
                  <span key={i} className={i < strikes ? 'hit' : ''}>
                    {i < strikes ? <X size={14} /> : <Heart size={12} fill="currentColor" />}
                  </span>
                ))}
              </span>
              <span className="rush-score">{score}</span>
            </>
          ) : (
            <b>Puzzle Rush</b>
          )}
        </div>
        <div className="board-row">
          {phase === 'running' && solver.view ? (
            <Board
              fen={solver.view.fen}
              orientation={solver.solver === 'b' ? 'black' : 'white'}
              lastMove={solver.view.lastMove}
              check={solver.view.check}
              movableColor={solver.state === 'solve' && solver.solver ? (solver.solver === 'w' ? 'white' : 'black') : undefined}
              dests={solver.dests}
              onMove={solver.onMove}
            />
          ) : (
            <Board fen="r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3" orientation="white" viewOnly />
          )}
          {phase === 'running' && (solver.state === 'wrong' || solver.state === 'solved') && (
            <span className={`board-flash ${solver.state === 'wrong' ? 'wrong' : 'right'}`}>
              {solver.state === 'wrong' ? <X size={26} /> : <Check size={26} />}
            </span>
          )}
        </div>
      </div>

      <div className="side-panel">
        <div className="panel-body">
          {phase === 'intro' && (
            <div className="coach-card">
              <div className="coach-top">
                <span className="coach-step">Puzzle Rush</span>
                {rushBest > 0 && <span className="pill gold">Best {rushBest}</span>}
              </div>
              <h3 className="coach-title">
                <Timer size={20} /> 3 minutes. 3 lives.
              </h3>
              <p className="coach-text">
                Solve as many puzzles as you can. They start easy and get harder with every one you solve. A wrong move costs a life.
              </p>
            </div>
          )}
          {phase === 'running' && puzzle && (
            <div className="coach-card">
              <div className="coach-top">
                <span className="coach-step">
                  #{results.length + 1} · {puzzle.rating}
                </span>
                <span className="result-dots">
                  {results.slice(-12).map((ok, i) => (
                    <span key={i} className={ok ? 'ok' : 'bad'} />
                  ))}
                </span>
              </div>
              <h3 className="coach-title">{solver.solver === 'b' ? 'Black' : 'White'} to move</h3>
            </div>
          )}
          {phase === 'over' && (
            <div className="coach-card finish-card">
              <span className="coach-step">Time’s up</span>
              <div className="rush-score" style={{ fontSize: '3rem' }}>
                {score}
              </div>
              <h3>{newBest ? 'New personal best!' : rushBest ? `Your best is ${rushBest}` : 'Well played'}</h3>
              <span className="result-dots" style={{ justifyContent: 'center' }}>
                {results.map((ok, i) => (
                  <span key={i} className={ok ? 'ok' : 'bad'} />
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="play-controls">
          {phase === 'running' ? (
            <button className="ctl" onClick={() => finish(results)}>
              <span className="ctl-ico">
                <X size={20} />
              </span>
              <span className="ctl-label">End run</span>
            </button>
          ) : (
            <button className="btn primary big" onClick={start} disabled={!all?.length}>
              {phase === 'over' ? <RotateCcw size={20} /> : <Play size={20} fill="currentColor" />}
              {phase === 'over' ? 'Play again' : 'Start'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
