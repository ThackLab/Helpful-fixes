import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board, type PromotionPiece } from '../components/Board';
import { ClassIcon } from '../components/ClassIcon';
import { deletePuzzle, listPuzzles, onDbChange, savePuzzle, type Puzzle } from '../lib/storage/db';
import { getAnalysisEngine } from '../lib/engine/manager';
import { scoreToCp } from '../lib/engine/uci';
import { formatLine, legalDests, moveToUci, playUci } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import type { Classification } from '../lib/review/types';

const DAY = 86_400_000;
const INTERVALS = [DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY];

type Phase = 'solve' | 'checking' | 'correct' | 'wrong' | 'revealed';

export function PracticePage() {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [phase, setPhase] = useState<Phase>('solve');
  const [tried, setTried] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [firstTry, setFirstTry] = useState(true);
  const [skipped, setSkipped] = useState<string[]>([]);

  useEffect(() => {
    const load = () => listPuzzles().then(setPuzzles);
    void load();
    return onDbChange(load);
  }, []);

  const allDue = useMemo(() => (puzzles ?? []).filter((p) => p.due <= Date.now()).sort((a, b) => a.due - b.due), [puzzles]);
  const due = useMemo(() => allDue.filter((p) => !skipped.includes(p.id)), [allDue, skipped]);

  useEffect(() => {
    if (!current && due.length) {
      setCurrent(due[0]);
      setPhase('solve');
      setTried(null);
      setFirstTry(true);
    }
  }, [due, current]);

  const chess = useMemo(() => (current ? new Chess(current.fen) : null), [current]);
  const view = useMemo(() => {
    if (!current || !chess) return null;
    if (phase === 'revealed' || phase === 'correct') {
      const c = new Chess(current.fen);
      const u = phase === 'correct' && tried ? tried : current.solution[0];
      playUci(c, u);
      return { fen: c.fen(), lastMove: [u.slice(0, 2), u.slice(2, 4)] as [string, string], check: c.inCheck() };
    }
    if (phase === 'wrong' && tried) {
      const c = new Chess(current.fen);
      playUci(c, tried);
      return { fen: c.fen(), lastMove: [tried.slice(0, 2), tried.slice(2, 4)] as [string, string], check: c.inCheck() };
    }
    return { fen: current.fen, lastMove: undefined, check: chess.inCheck() };
  }, [current, chess, phase, tried]);

  const dests = useMemo(() => (chess && phase === 'solve' ? legalDests(chess) : undefined), [chess, phase]);
  const shapes = useMemo<DrawShape[]>(() => {
    if (!current || phase !== 'revealed') return [];
    const u = current.solution[0];
    return [{ orig: u.slice(0, 2) as Key, dest: u.slice(2, 4) as Key, brush: 'green' }];
  }, [current, phase]);

  const grade = async (p: Puzzle, ok: boolean) => {
    const box = ok ? (firstTry ? Math.min(INTERVALS.length - 1, p.box + 1) : p.box) : 0;
    const next: Puzzle = {
      ...p,
      attempts: p.attempts + 1,
      solved: p.solved + (ok ? 1 : 0),
      box,
      due: Date.now() + (ok ? INTERVALS[box] : 10 * 60_000),
    };
    await savePuzzle(next);
  };

  const onMove = async (from: string, to: string, promotion?: PromotionPiece) => {
    if (!current || !chess) return;
    const c = new Chess(current.fen);
    const mv = playUci(c, from + to + (promotion ?? ''));
    if (!mv) return;
    const uci = moveToUci(mv);
    playSound(soundForSan(mv.san));
    setTried(uci);
    let ok = uci === current.solution[0] || c.isCheckmate();
    if (!ok) {
      setPhase('checking');
      // Accept alternatives the engine rates as (practically) equal to the solution.
      const e = getAnalysisEngine();
      const sol = new Chess(current.fen);
      playUci(sol, current.solution[0]);
      const [a, b] = await Promise.all([
        e.analyse({ fen: c.fen(), limits: { depth: 14, movetime: 2500 } }),
        e.analyse({ fen: sol.fen(), limits: { depth: 14, movetime: 2500 } }),
      ]);
      const sign = current.color === 'w' ? 1 : -1;
      const mine = a.lines[0] ? sign * scoreToCp(a.lines[0].score) : -99999;
      const best = b.lines[0] ? sign * scoreToCp(b.lines[0].score) : 0;
      ok = mine >= best - 30;
    }
    playSound(ok ? 'correct' : 'wrong');
    setPhase(ok ? 'correct' : 'wrong');
    if (ok) {
      setStreak((s) => (firstTry ? s + 1 : s));
      await grade(current, true);
    } else {
      setStreak(0);
      if (firstTry) await grade(current, false);
      setFirstTry(false);
    }
  };

  const next = () => {
    setCurrent(null);
    setPhase('solve');
    setTried(null);
  };

  const total = puzzles?.length ?? 0;
  const mastered = (puzzles ?? []).filter((p) => p.box >= 3).length;

  if (puzzles === null) return <div className="page muted">Loading…</div>;

  if (!current) {
    const upcoming = [...puzzles].sort((a, b) => a.due - b.due)[0];
    return (
      <div className="page">
        <h1>Learn from your mistakes</h1>
        <p className="muted">
          Every blunder, mistake and missed chance from your reviewed games becomes a puzzle here. Solve them on a spaced-repetition schedule until
          the right idea is automatic.
        </p>
        <div className="row" style={{ gap: 30, margin: '18px 0' }}>
          <div className="stat">
            <span className="v">{total}</span>
            <span className="k">Positions</span>
          </div>
          <div className="stat">
            <span className="v">{mastered}</span>
            <span className="k">Mastered</span>
          </div>
          <div className="stat">
            <span className="v">{due.length}</span>
            <span className="k">Due now</span>
          </div>
        </div>
        <div className="card empty">
          {total === 0 ? (
            <>
              <p>No practice positions yet. Play and review a few games - your mistakes will show up here.</p>
              <button className="btn primary" onClick={() => navigate('/play')}>
                Play a bot
              </button>
            </>
          ) : (
            <p>All caught up! 🎉 {upcoming ? `Next position due ${new Date(upcoming.due).toLocaleString()}.` : ''}</p>
          )}
        </div>
      </div>
    );
  }

  const side = current.color === 'w' ? 'White' : 'Black';
  return (
    <div className="game-layout">
      <div className="board-column">
        <div className="player-bar" style={{ minHeight: 30 }}>
          <b>Find the best move for {side}</b>
        </div>
        <div className="board-row">
          {view && (
            <Board
              fen={view.fen}
              orientation={current.color === 'w' ? 'white' : 'black'}
              movableColor={phase === 'solve' ? (current.color === 'w' ? 'white' : 'black') : undefined}
              dests={dests}
              lastMove={view.lastMove}
              check={view.check}
              shapes={shapes}
              onMove={onMove}
              viewOnly={phase !== 'solve'}
            />
          )}
        </div>
      </div>
      <div className="side-panel">
        <div className="panel-head">
          <span style={{ fontSize: 22 }}>🎯</span>
          <b>Practice</b>
          <span className="spacer" />
          <span className="faint">
            {allDue.length} due · streak {streak}
          </span>
        </div>
        <div className="panel-body">
          <div className="coach">
            <div className="coach-avatar">🧑‍🏫</div>
            <div className="bubble">
              <div className="headline">
                {phase === 'solve' && `${side} to move`}
                {phase === 'checking' && 'Checking…'}
                {phase === 'correct' && (
                  <>
                    <ClassIcon cls="best" /> Correct!
                  </>
                )}
                {phase === 'wrong' && (
                  <>
                    <ClassIcon cls="mistake" /> Not this time
                  </>
                )}
                {phase === 'revealed' && 'Solution'}
              </div>
              <p>
                {phase === 'solve' && (
                  <>
                    In your game you played <b>{current.playedSan}</b>{' '}
                    <span style={{ verticalAlign: 'middle' }}>
                      <ClassIcon cls={current.classification as Classification} size={16} />
                    </span>
                    . Can you find the stronger move?
                  </>
                )}
                {(phase === 'correct' || phase === 'revealed') && (
                  <>
                    {formatLine(current.fen, current.solutionSan)}
                    <br />
                    <span style={{ color: '#555', fontSize: '0.85rem' }}>{current.comment}</span>
                  </>
                )}
                {phase === 'wrong' && 'That move doesn’t solve the position. Try again, or reveal the solution.'}
              </p>
            </div>
          </div>
          <div className="faint" style={{ fontSize: '0.8rem', marginTop: 10 }}>
            Box {current.box + 1}/{INTERVALS.length} · solved {current.solved}/{current.attempts} · from{' '}
            <a href={`#/review/${current.gameId}`}>this game</a>
          </div>
        </div>
        <div className="panel-foot">
          {phase === 'wrong' && (
            <button className="btn" onClick={() => (setPhase('solve'), setTried(null))}>
              Try again
            </button>
          )}
          {(phase === 'solve' || phase === 'wrong') && (
            <button
              className="btn"
              onClick={async () => {
                setPhase('revealed');
                if (firstTry) await grade(current, false);
              }}
            >
              Show solution
            </button>
          )}
          <span className="spacer" />
          <button
            className="btn ghost small"
            title="Remove this position from practice"
            onClick={async () => {
              await deletePuzzle(current.id);
              next();
            }}
          >
            Remove
          </button>
          {(phase === 'correct' || phase === 'revealed') && (
            <button className="btn primary" onClick={next}>
              Next ▶
            </button>
          )}
          {phase === 'solve' && (
            <button className="btn ghost" onClick={() => (setSkipped((s) => [...s, current.id]), next())}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
