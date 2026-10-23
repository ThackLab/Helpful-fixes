import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board, type PromotionPiece } from '../components/Board';
import { useSolver } from '../components/useSolver';
import { LESSONS, findLesson, type DrillStep, type Lesson, type LessonStep, type PuzzleStep } from '../lib/learn/curriculum';
import { loadPuzzles } from '../lib/learn/puzzles';
import { getAnalysisEngine } from '../lib/engine/manager';
import { legalDests, moveToUci, playUci, sanLine } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { useLearn } from '../state/learn';

const BRUSH: Record<string, string> = { r: 'red', b: 'blue', y: 'yellow' };

export function arrowShapes(arrows: string[] = []): DrawShape[] {
  return arrows.map((a) => {
    const [brush, sq] = a.includes(':') ? [BRUSH[a[0]] ?? 'green', a.slice(2)] : ['green', a];
    return { orig: sq.slice(0, 2) as Key, dest: sq.slice(2, 4) as Key, brush };
  });
}

const markMap = (marks: string[] = []) => (marks.length ? new Map(marks.map((m) => [m, 'hl-key'])) : undefined);
const lastOf = (uci?: string) => (uci ? ([uci.slice(0, 2), uci.slice(2, 4)] as [string, string]) : undefined);

const STEP_LABEL: Record<LessonStep['kind'], string> = { info: 'Idea', walk: 'Example', puzzle: 'Your move', drill: 'Drill' };

/** Number of generated practice puzzles for a lesson's themes. */
export function usePracticeCount(lesson: Lesson | undefined) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!lesson?.themes.length) return;
    void loadPuzzles().then((ps) => setN(ps.filter((p) => p.themes.some((t) => lesson.themes.includes(t))).length));
  }, [lesson]);
  return n;
}

export function LessonPage({ id }: { id: string }) {
  const lesson = findLesson(id);
  const reach = useLearn((s) => s.reach);
  const complete = useLearn((s) => s.complete);
  const [idx, setIdx] = useState(0);
  const [walkPly, setWalkPly] = useState(0);
  const practiceCount = usePracticeCount(lesson);

  const step: LessonStep | undefined = lesson?.steps[idx];
  const puzzle = step?.kind === 'puzzle' ? step : null;
  const solverInput = useMemo(
    () => (puzzle ? { fen: puzzle.fen, line: puzzle.line, alts: puzzle.alts, anyMate: puzzle.anyMate, hint: puzzle.hint } : null),
    [puzzle],
  );
  const solver = useSolver(solverInput);
  const drillStep = step?.kind === 'drill' ? step : null;
  const drill = useDrill(drillStep);
  const drillDone = drill.status === 'won';

  useEffect(() => {
    setWalkPly(0);
    if (!lesson) return;
    if (idx >= lesson.steps.length) complete(lesson.id);
    else reach(lesson.id, idx);
  }, [idx, lesson, reach, complete]);

  if (!lesson)
    return (
      <div className="page empty">
        <h2>Lesson not found</h2>
        <button className="btn primary" onClick={() => navigate('/learn')}>
          Back to Learn
        </button>
      </div>
    );

  const total = lesson.steps.length;
  const finished = idx >= total;
  const nextLesson = LESSONS[LESSONS.indexOf(lesson) + 1];
  const walk = step?.kind === 'walk' ? step : null;
  const canAdvance =
    !step ||
    step.kind === 'info' ||
    (walk && walkPly >= walk.moves.length) ||
    (puzzle && (solver.state === 'solved' || solver.state === 'revealed')) ||
    (step.kind === 'drill' && drillDone);

  const next = () => {
    if (walk && walkPly < walk.moves.length) {
      playSound(
        soundForSan(
          sanLine(
            walk.fen,
            walk.moves.slice(0, walkPly + 1).map((m) => m.uci),
          ).at(-1) ?? '',
        ),
      );
      setWalkPly(walkPly + 1);
      return;
    }
    setIdx(Math.min(total, idx + 1));
  };
  const back = () => {
    if (walk && walkPly > 0) setWalkPly(walkPly - 1);
    else setIdx(Math.max(0, idx - 1));
  };

  // ---- board for the current step
  let board: { fen: string; lastMove?: [string, string]; shapes?: DrawShape[]; highlights?: Map<string, string>; check?: boolean } = {
    fen: lesson.steps[Math.min(idx, total - 1)].fen,
  };
  if (step?.kind === 'info') board = { fen: step.fen, shapes: arrowShapes(step.arrows), highlights: markMap(step.marks) };
  if (walk) {
    const c = new Chess(walk.fen);
    for (const m of walk.moves.slice(0, walkPly)) playUci(c, m.uci);
    const m = walk.moves[walkPly - 1];
    board = { fen: c.fen(), lastMove: lastOf(m?.uci), shapes: arrowShapes(m?.arrows), check: c.inCheck() };
  }
  if (puzzle && solver.view)
    board = { fen: solver.view.fen, lastMove: solver.view.lastMove, check: solver.view.check, highlights: solver.highlights };

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="player-bar lesson-top">
          <b>
            {lesson.icon} {lesson.title}
          </b>
          <span className="spacer" />
          <span className="faint">{finished ? 'Done' : `${idx + 1} / ${total}`}</span>
        </div>
        <div className="lesson-progress">
          <span style={{ width: `${(Math.min(idx + (canAdvance ? 1 : 0), total) / total) * 100}%` }} />
        </div>
        <div className="board-row">
          {drillStep ? (
            <Board
              fen={drill.chess.fen()}
              orientation={drill.userColor === 'w' ? 'white' : 'black'}
              lastMove={drill.lastMove}
              check={drill.chess.inCheck()}
              movableColor={drill.status === 'play' ? (drill.userColor === 'w' ? 'white' : 'black') : undefined}
              dests={drill.dests}
              onMove={drill.onMove}
            />
          ) : (
            <Board
              fen={board.fen}
              orientation="white"
              lastMove={board.lastMove}
              check={board.check}
              shapes={board.shapes}
              highlights={board.highlights}
              movableColor={puzzle && solver.state === 'solve' && solver.solver ? (solver.solver === 'w' ? 'white' : 'black') : undefined}
              dests={puzzle ? solver.dests : undefined}
              onMove={puzzle ? solver.onMove : undefined}
              viewOnly={!puzzle}
            />
          )}
        </div>
      </div>

      <div className="side-panel">
        <div className="panel-body">
          {finished ? (
            <div className="coach-card">
              <div className="coach-top">
                <span className="coach-step">Lesson complete</span>
              </div>
              <h3 className="coach-title">✅ {lesson.title}</h3>
              <div className="lesson-box">
                <div className="lesson-head">
                  <span className="lesson-icon">{lesson.icon}</span>
                  <div>
                    <div className="coach-label">Remember</div>
                    <b>{lesson.rule}</b>
                  </div>
                </div>
              </div>
              <div className="coach-section">
                <div className="coach-label">How to spot it in your games</div>
                <ul className="spot-list">
                  {lesson.spot.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="row">
                {lesson.themes.length > 0 && (practiceCount ?? 0) > 0 && (
                  <button className="btn primary" onClick={() => navigate(`/tactics?lesson=${lesson.id}`)}>
                    🧩 Practise ({practiceCount} puzzle{practiceCount === 1 ? '' : 's'})
                  </button>
                )}
                {nextLesson && (
                  <button className="btn" onClick={() => navigate(`/learn/${nextLesson.id}`)}>
                    Next: {nextLesson.title} ▶
                  </button>
                )}
              </div>
            </div>
          ) : step?.kind === 'info' ? (
            <StepCard step={step} label={STEP_LABEL.info} text={step.text} />
          ) : walk ? (
            <StepCard step={walk} label={STEP_LABEL.walk} text={walkPly === 0 ? walk.text : walk.moves[walkPly - 1].text}>
              <p className="coach-line">
                {sanLine(
                  walk.fen,
                  walk.moves.slice(0, walkPly).map((m) => m.uci),
                ).join(' ') || ' '}
              </p>
            </StepCard>
          ) : puzzle ? (
            <PuzzleCard step={puzzle} solver={solver} />
          ) : drillStep ? (
            <StepCard step={drillStep} label={STEP_LABEL.drill} text={drillDone ? drillStep.success : drillStep.text}>
              <p className={`coach-text ${drill.status === 'lost' ? 'wrong-text' : 'faint'}`}>
                {drill.status === 'won' ? '✅ Done!' : drill.status === 'lost' ? drill.note : `Move ${drill.moveNo} of ${drillStep.maxMoves}`}
              </p>
              {(drill.status === 'lost' || drill.status === 'won' || drill.moveNo > 1) && (
                <div className="row">
                  <button className="btn small" onClick={drill.reset}>
                    ↺ Start again
                  </button>
                </div>
              )}
            </StepCard>
          ) : null}
        </div>

        <div className="play-controls">
          <button className="ctl" onClick={() => navigate('/learn')}>
            <span className="ctl-ico">✕</span>
            <span className="ctl-label">Close</span>
          </button>
          <button className="ctl" onClick={back} disabled={idx === 0 && walkPly === 0}>
            <span className="ctl-ico">◀</span>
            <span className="ctl-label">Back</span>
          </button>
          {puzzle && (
            <button className="ctl" onClick={solver.hint} disabled={solver.state !== 'solve' || solver.hintLevel >= 2}>
              <span className="ctl-ico">💡</span>
              <span className="ctl-label">Hint</span>
            </button>
          )}
          {finished ? (
            <button className="ctl wide" onClick={() => navigate(nextLesson ? `/learn/${nextLesson.id}` : '/learn')}>
              <span className="ctl-ico">▶</span>
              <span className="ctl-label">{nextLesson ? 'Next lesson' : 'All lessons'}</span>
            </button>
          ) : (
            <button className="ctl wide" onClick={next} disabled={!canAdvance && !(walk && walkPly < walk.moves.length)}>
              <span className="ctl-ico">▶</span>
              <span className="ctl-label">{walk && walkPly < walk.moves.length ? 'Play move' : idx === total - 1 ? 'Finish' : 'Next'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, label, text, children }: { step: LessonStep; label: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="coach-card">
      <div className="coach-top">
        <span className="coach-step">{label}</span>
      </div>
      <h3 className="coach-title">{step.title}</h3>
      <p className="coach-text">{text}</p>
      {children}
    </div>
  );
}

type Solver = ReturnType<typeof useSolver>;

export function SolverFeedback({
  solver,
  success,
  alt,
  showReveal = true,
  showResult = true,
}: {
  solver: Solver;
  success: React.ReactNode;
  alt?: string;
  showReveal?: boolean;
  showResult?: boolean;
}) {
  return (
    <>
      {solver.state === 'solve' && solver.hints && solver.hintLevel >= 1 && <p className="coach-hint">💡 {solver.hints.idea}</p>}
      {solver.state === 'solve' && solver.hints && solver.hintLevel >= 2 && <p className="coach-hint">👉 {solver.hints.piece}</p>}
      {solver.state === 'checking' && <p className="coach-text faint">Checking your move…</p>}
      {solver.state === 'wrong' && (
        <>
          <p className="coach-text wrong-text">
            <b>Not quite.</b> {solver.message ?? 'That move doesn’t work here.'}
          </p>
          <div className="row">
            <button className="btn small primary" onClick={solver.retry}>
              Try again
            </button>
            <button className="btn small" onClick={() => void solver.reveal()}>
              Show the answer
            </button>
          </div>
        </>
      )}
      {solver.state === 'solve' && showReveal && (
        <div className="row">
          <button className="btn small" onClick={() => void solver.reveal()}>
            Show the answer
          </button>
        </div>
      )}
      {(solver.state === 'solved' || solver.state === 'revealed') && (
        <div className="coach-section">
          {showResult && (
            <div className={`coach-result ${solver.state === 'solved' ? 'good' : ''}`}>
              {solver.state === 'solved' ? (solver.failed ? '✅ Solved' : '✅ Correct!') : '💡 Here’s the solution'}
            </div>
          )}
          {solver.alt && alt && <p className="coach-text faint">That works too. {alt}</p>}
          <p className="coach-text">{success}</p>
        </div>
      )}
    </>
  );
}

function PuzzleCard({ step, solver }: { step: PuzzleStep; solver: Solver }) {
  const main = sanLine(step.fen, step.line).join(' ');
  return (
    <div className="coach-card">
      <div className="coach-top">
        <span className="coach-step">{STEP_LABEL.puzzle}</span>
      </div>
      <h3 className="coach-title">{step.title}</h3>
      <p className="coach-text">{step.text}</p>
      <SolverFeedback solver={solver} success={step.success} alt={`The idea of this lesson was ${main.split(' ')[0]}.`} />
      {(solver.state === 'solved' || solver.state === 'revealed') && <p className="coach-line">{main}</p>}
    </div>
  );
}

/** Play the position out against Stockfish until the goal is reached. */
function useDrill(step: DrillStep | null) {
  const [moves, setMoves] = useState<string[]>([]);
  const [status, setStatus] = useState<'play' | 'thinking' | 'won' | 'lost'>('play');
  const [note, setNote] = useState<string | null>(null);
  const token = useRef(0);
  const reset = () => {
    token.current++;
    setMoves([]);
    setStatus('play');
    setNote(null);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [step]);
  const chess = useMemo(() => {
    const c = new Chess(step?.fen);
    for (const u of moves) playUci(c, u);
    return c;
  }, [step, moves]);
  const userColor = (step?.fen.split(' ')[1] ?? 'w') as 'w' | 'b';

  const fail = (why: string) => {
    setStatus('lost');
    setNote(why);
    playSound('wrong');
  };
  const win = () => {
    setStatus('won');
    playSound('correct');
  };

  const onMove = async (from: string, to: string, promotion?: PromotionPiece) => {
    if (!step || status !== 'play') return;
    const t = token.current;
    const c = new Chess(chess.fen());
    const mv = playUci(c, from + to + (promotion ?? ''));
    if (!mv) return;
    const played = [...moves, moveToUci(mv)];
    setMoves(played);
    playSound(soundForSan(mv.san));
    if (c.isCheckmate()) return win();
    if (step.goal === 'promote' && mv.promotion && !c.moves({ verbose: true }).some((m) => m.to === mv.to)) return win();
    if (c.isStalemate()) return fail('Stalemate - that’s a draw. Always leave the king a square until you can mate.');
    if (c.isDraw()) return fail('That’s a draw. Try again.');
    if (Math.ceil(played.length / 2) >= step.maxMoves) return fail(`Out of moves - you had ${step.maxMoves}. Try again, a little more directly.`);
    setStatus('thinking');
    const r = await getAnalysisEngine().analyse({ fen: c.fen(), limits: { depth: 14, movetime: 700 } });
    if (token.current !== t) return;
    const reply = r.lines[0]?.pv[0] ?? r.bestmove;
    if (!reply) return;
    const m2 = playUci(c, reply);
    setMoves([...played, reply]);
    playSound(soundForSan(m2?.san ?? ''));
    if (!c.board().some((row) => row.some((p) => p && p.color === userColor && p.type !== 'k')))
      return fail(
        step.goal === 'promote'
          ? 'Your pawn was captured. Lead with the king and take the opposition.'
          : `Stockfish took your ${m2?.captured === 'q' ? 'queen' : m2?.captured === 'r' ? 'rook' : 'piece'}. Keep it protected or out of the king’s reach.`,
      );
    if (c.isDraw()) return fail('That’s a draw. Try again.');
    setStatus('play');
  };

  return {
    chess,
    userColor,
    lastMove: lastOf(moves.at(-1)),
    status,
    note,
    moveNo: Math.min(Math.ceil(moves.length / 2) + 1, step?.maxMoves ?? 0),
    dests: status === 'play' ? legalDests(chess) : undefined,
    onMove,
    reset,
  };
}
