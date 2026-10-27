import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { ChevronLeft, ChevronRight, Lightbulb, RotateCcw, Trophy, X } from 'lucide-react';
import { Board, type PromotionPiece } from '../components/Board';
import { useSolver } from '../components/useSolver';
import { findLesson, type DrillStep, type LessonStep, type PuzzleStep, type QuizStep } from '../lib/learn/curriculum';
import { explainPuzzle, puzzleSetup, solutionSan, type TacticPuzzle } from '../lib/learn/puzzles';
import { levelOfLesson, starsFor } from '../lib/learn/levels';
import { getAnalysisEngine } from '../lib/engine/manager';
import { legalDests, moveToUci, playUci, sanLine } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { Stars } from '../components/ui';
import { pickSet, useLearn } from '../state/learn';
import { usePuzzleBank } from './Puzzles';

const BRUSH: Record<string, string> = { r: 'red', b: 'blue', y: 'yellow' };

export function arrowShapes(arrows: string[] = []): DrawShape[] {
  return arrows.map((a) => {
    const [brush, sq] = a.includes(':') ? [BRUSH[a[0]] ?? 'green', a.slice(2)] : ['green', a];
    return { orig: sq.slice(0, 2) as Key, dest: sq.slice(2, 4) as Key, brush };
  });
}

const markMap = (marks: string[] = []) => (marks.length ? new Map(marks.map((m) => [m, 'hl-key'])) : undefined);
const lastOf = (uci?: string) => (uci ? ([uci.slice(0, 2), uci.slice(2, 4)] as [string, string]) : undefined);

/** Keeps an element visible inside its scrolling panel whenever `dep` changes (never scrolls the page). */
function useRevealInPanel<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const box = el?.closest<HTMLElement>('.panel-body');
    if (!el || !box) return;
    const over = el.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
    if (over > 0) box.scrollTop += over + 12;
  }, [dep]);
  return ref;
}

const STEP_LABEL: Record<LessonStep['kind'], string> = {
  info: 'Idea',
  walk: 'Example',
  puzzle: 'Your move',
  drill: 'Drill',
  quiz: 'Question',
  pattern: 'The pattern',
  tap: 'Spot it',
};
const PRACTICE_SIZE = 5;

export function LessonPage({ id }: { id: string }) {
  const lesson = findLesson(id);
  const level = levelOfLesson(id);
  const reach = useLearn((s) => s.reach);
  const finishLesson = useLearn((s) => s.finishLesson);
  const record = useLearn((s) => s.record);
  const prevBest = useLearn((s) => s.lessons[id]?.best);
  const bank = usePuzzleBank();
  const [idx, setIdx] = useState(0);
  const [walkPly, setWalkPly] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  /** Spot-it steps: the square tapped last, whether the right one has been found, and how many misses. */
  const [tap, setTap] = useState<{ square: string | null; right: boolean; misses: number }>({ square: null, right: false, misses: 0 });
  /** Score (0..1) of each graded step, by step index; practice puzzles follow the steps. */
  const [scores, setScores] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; stars: number; improved: boolean } | null>(null);
  const [practice, setPractice] = useState<TacticPuzzle[] | null>(null);

  // The practice set: puzzles from the bank on this lesson's themes, at this level.
  useEffect(() => {
    if (!bank || !lesson || practice) return;
    setPractice(
      lesson.themes.length
        ? pickSet(bank, { themes: lesson.themes, band: level?.band ?? [400, 1600], n: PRACTICE_SIZE, recent: useLearn.getState().recent })
        : [],
    );
  }, [bank, lesson, level, practice]);

  const steps = lesson?.steps ?? [];
  const total = steps.length + (practice?.length ?? 0);
  const step: LessonStep | undefined = steps[idx];
  const practicePuzzle = idx >= steps.length ? practice?.[idx - steps.length] : undefined;
  const finished = !!lesson && practice !== null && idx >= total;
  const puzzle = step?.kind === 'puzzle' ? step : null;
  const solverInput = useMemo(
    () =>
      puzzle
        ? { fen: puzzle.fen, line: puzzle.line, alts: puzzle.alts, anyMate: puzzle.anyMate, hint: puzzle.hint }
        : practicePuzzle
          ? puzzleSetup(practicePuzzle)
          : null,
    [puzzle, practicePuzzle],
  );
  const solver = useSolver(solverInput);
  const drillStep = step?.kind === 'drill' ? step : null;
  const drill = useDrill(drillStep);
  const drillDone = drill.status === 'won';

  useEffect(() => {
    setWalkPly(0);
    setPicked(null);
    setTap({ square: null, right: false, misses: 0 });
    if (lesson && idx < steps.length) reach(lesson.id, idx);
  }, [idx, lesson, steps.length, reach]);

  const grade = (i: number, v: number) => setScores((s) => (i in s ? s : { ...s, [i]: v }));

  // Grade solved puzzles (lesson puzzles and practice) the first time they finish.
  useEffect(() => {
    if (!solverInput || (!puzzle && !practicePuzzle)) return;
    if (solver.state !== 'solved' && solver.state !== 'revealed' && solver.state !== 'wrong') return;
    if (practicePuzzle) {
      if (idx in scores) return;
      const ok = solver.state === 'solved' && !solver.failed && solver.hintLevel === 0;
      grade(idx, ok ? 1 : 0);
      record(practicePuzzle, ok, true);
      return;
    }
    if (solver.state === 'wrong') return;
    grade(idx, solver.state === 'revealed' ? 0 : solver.failed ? 0.4 : solver.hintLevel > 0 ? 0.7 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solver.state]);
  useEffect(() => {
    if (drillStep && drill.status === 'won') grade(idx, drill.losses ? 0.6 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill.status]);

  // The lesson is graded once, when the last step is done.
  useEffect(() => {
    if (!finished || !lesson || result) return;
    const graded = Object.values(scores);
    const score = graded.length ? (graded.reduce((a, b) => a + b, 0) / graded.length) * 100 : 100;
    const r = finishLesson(lesson.id, score);
    setResult({ score: Math.round(score), stars: starsFor(score), improved: r.improved });
    playSound('correct');
  }, [finished, lesson, result, scores, finishLesson]);

  if (!lesson)
    return (
      <div className="page empty">
        <h2>Lesson not found</h2>
        <button className="btn primary" onClick={() => navigate('/learn')}>
          Back to Learn
        </button>
      </div>
    );

  const levelLessons = level?.lessons ?? [];
  const nextId = levelLessons[levelLessons.indexOf(lesson.id) + 1];
  const nextLesson = nextId ? findLesson(nextId) : undefined;
  const walk = step?.kind === 'walk' ? step : null;
  const quiz = step?.kind === 'quiz' ? step : null;
  const tapStep = step?.kind === 'tap' ? step : null;
  const pickedOption = quiz && picked !== null ? quiz.options[picked] : null;
  const solverDone = solver.state === 'solved' || solver.state === 'revealed';
  const canAdvance =
    (!step && !practicePuzzle) ||
    step?.kind === 'info' ||
    step?.kind === 'pattern' ||
    (tapStep && tap.right) ||
    (walk && walkPly >= walk.moves.length) ||
    (puzzle && solverDone) ||
    (practicePuzzle && (solverDone || idx in scores)) ||
    (step?.kind === 'drill' && drillDone) ||
    !!pickedOption?.correct;

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
  const restart = () => {
    setScores({});
    setResult(null);
    setPractice(null);
    setIdx(0);
  };
  const onTap = (square: string) => {
    if (!tapStep || tap.right) return;
    const right = tapStep.answers.includes(square);
    setTap({ square, right, misses: tap.misses + (right ? 0 : 1) });
    playSound(right ? 'correct' : 'wrong');
    if (right) grade(idx, tap.misses ? 0.4 : 1);
  };
  const onPick = (i: number) => {
    if (!quiz) return;
    setPicked(i);
    playSound(quiz.options[i].correct ? 'correct' : 'wrong');
    grade(idx, quiz.options[i].correct ? 1 : 0.3);
  };

  // ---- board for the current step
  const lastFen = steps[Math.min(idx, steps.length - 1)]?.fen;
  let board: { fen: string; lastMove?: [string, string]; shapes?: DrawShape[]; highlights?: Map<string, string>; check?: boolean } = { fen: lastFen };
  if (step?.kind === 'info' || step?.kind === 'pattern') board = { fen: step.fen, shapes: arrowShapes(step.arrows), highlights: markMap(step.marks) };
  if (tapStep)
    board = {
      fen: tapStep.fen,
      shapes: tap.right ? arrowShapes(tapStep.arrows) : undefined,
      highlights: tap.square ? new Map([[tap.square, tap.right ? 'hl-right' : 'hl-wrong']]) : undefined,
    };
  if (walk) {
    const c = new Chess(walk.fen);
    for (const m of walk.moves.slice(0, walkPly)) playUci(c, m.uci);
    const m = walk.moves[walkPly - 1];
    board = { fen: c.fen(), lastMove: lastOf(m?.uci), shapes: arrowShapes(m?.arrows), check: c.inCheck() };
  }
  if ((puzzle || practicePuzzle) && solver.view)
    board = { fen: solver.view.fen, lastMove: solver.view.lastMove, check: solver.view.check, highlights: solver.highlights };
  if (quiz) {
    const c = new Chess(quiz.fen);
    if (pickedOption?.uci) playUci(c, pickedOption.uci);
    board = { fen: c.fen(), lastMove: lastOf(pickedOption?.uci), check: c.inCheck(), shapes: arrowShapes(pickedOption?.arrows) };
  }
  const interactive = !!(puzzle || practicePuzzle);
  const orientation = practicePuzzle && solver.solver === 'b' ? 'black' : puzzle && puzzle.fen.split(' ')[1] === 'b' ? 'black' : 'white';

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="player-bar lesson-top">
          <button className="icon-btn" onClick={() => navigate('/learn')} aria-label="Close">
            <X size={22} />
          </button>
          <b>{lesson.title}</b>
          <span className="spacer" />
          <span className="faint num">{finished ? '' : `${Math.min(idx + 1, total)} / ${total}`}</span>
        </div>
        <div className="lesson-progress">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i in scores ? (scores[i] >= 1 ? 'done' : 'miss') : i < idx ? 'done' : i === idx ? 'cur' : ''} />
          ))}
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
          ) : board.fen ? (
            <Board
              fen={board.fen}
              orientation={orientation}
              lastMove={board.lastMove}
              check={board.check}
              shapes={board.shapes}
              highlights={board.highlights}
              movableColor={interactive && solver.state === 'solve' && solver.solver ? (solver.solver === 'w' ? 'white' : 'black') : undefined}
              dests={interactive ? solver.dests : undefined}
              onMove={interactive ? solver.onMove : undefined}
              onSelect={tapStep ? onTap : undefined}
              viewOnly={!interactive && !tapStep}
            />
          ) : (
            <div className="board-placeholder" />
          )}
        </div>
      </div>

      <div className="side-panel">
        <div className="panel-body">
          {finished && result ? (
            <div className="coach-card finish-card">
              <span className="coach-step">Lesson complete</span>
              <Stars n={result.stars} big />
              <h3>{result.stars === 3 ? 'Perfect!' : result.stars === 2 ? 'Well done' : 'Lesson done'}</h3>
              <p className="score-line">
                Score {result.score}%
                {prevBest !== undefined && prevBest > result.score
                  ? ` · best ${prevBest}%`
                  : result.improved && prevBest !== undefined
                    ? ' · new best'
                    : ''}
                {result.stars < 3 ? ` · ${result.stars === 1 ? '70' : '90'}% for the next star` : ''}
              </p>
              <div className="lesson-box">
                <div className="coach-label">Remember</div>
                <p style={{ fontWeight: 650 }}>{lesson.rule}</p>
              </div>
              <div className="coach-section">
                <div className="coach-label">How to spot it in your games</div>
                <ul className="spot-list">
                  {lesson.spot.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : step?.kind === 'info' ? (
            <StepCard step={step} label={STEP_LABEL.info} text={step.text} />
          ) : step?.kind === 'pattern' ? (
            <div className="coach-card pattern" key={step.title}>
              <span className="coach-step">{STEP_LABEL.pattern}</span>
              <h3 className="coach-title">{step.title}</h3>
              <dl>
                <div>
                  <dt>What it is</dt>
                  <dd>{step.what}</dd>
                </div>
                <div>
                  <dt>What to look for</dt>
                  <dd>{step.cue}</dd>
                </div>
                <div>
                  <dt>How to set it up</dt>
                  <dd>{step.setup}</dd>
                </div>
                <div>
                  <dt>How to defend</dt>
                  <dd>{step.defend}</dd>
                </div>
              </dl>
            </div>
          ) : tapStep ? (
            <div className={`coach-card ${tap.right ? 'good' : tap.square ? 'bad' : ''}`} key={tapStep.title}>
              <span className="coach-step">{STEP_LABEL.tap}</span>
              <h3 className="coach-title">{tap.right ? 'Yes' : tap.square ? 'Not that one' : tapStep.title}</h3>
              <p className="coach-text">{tap.right ? tapStep.success : tapStep.text}</p>
              {!tap.right && <p className="coach-line">Tap a square on the board.</p>}
            </div>
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
          ) : quiz ? (
            <QuizCard step={quiz} picked={picked} onPick={onPick} />
          ) : drillStep ? (
            <StepCard step={drillStep} label={STEP_LABEL.drill} text={drillDone ? drillStep.success : drillStep.text}>
              <p className={`coach-text ${drill.status === 'lost' ? 'wrong-text' : 'faint'}`}>
                {drill.status === 'won' ? 'Done!' : drill.status === 'lost' ? drill.note : `Move ${drill.moveNo} of ${drillStep.maxMoves}`}
              </p>
              {(drill.status === 'lost' || drill.status === 'won' || drill.moveNo > 1) && (
                <div className="row">
                  <button className="btn small" onClick={drill.reset}>
                    <RotateCcw size={14} /> Start again
                  </button>
                </div>
              )}
            </StepCard>
          ) : practicePuzzle ? (
            <PracticeCard puzzle={practicePuzzle} solver={solver} n={idx - steps.length + 1} of={practice?.length ?? 0} graded={scores[idx]} />
          ) : (
            <p className="faint">Loading…</p>
          )}
        </div>

        <div className="play-controls">
          {finished ? (
            <>
              <button className="ctl" onClick={restart}>
                <span className="ctl-ico">
                  <RotateCcw size={20} />
                </span>
                <span className="ctl-label">Retry</span>
              </button>
              <button
                className="ctl wide go"
                onClick={() => navigate(nextLesson ? `/learn/${nextLesson.id}` : level ? `/exam/${level.id}` : '/learn')}
              >
                <span className="ctl-ico">{nextLesson ? <ChevronRight size={22} /> : <Trophy size={20} />}</span>
                <span className="ctl-label">{nextLesson ? `Next: ${nextLesson.title}` : level ? `Level ${level.n} exam` : 'Back to the course'}</span>
              </button>
            </>
          ) : (
            <>
              <button className="ctl" onClick={back} disabled={idx === 0 && walkPly === 0}>
                <span className="ctl-ico">
                  <ChevronLeft size={22} />
                </span>
                <span className="ctl-label">Back</span>
              </button>
              {interactive && (
                <button className="ctl" onClick={solver.hint} disabled={solver.state !== 'solve' || solver.hintLevel >= 2}>
                  <span className="ctl-ico">
                    <Lightbulb size={20} />
                  </span>
                  <span className="ctl-label">Hint</span>
                </button>
              )}
              <button
                className={`ctl wide ${canAdvance ? 'go' : ''}`}
                onClick={next}
                disabled={!canAdvance && !(walk && walkPly < walk.moves.length)}
              >
                <span className="ctl-ico">
                  <ChevronRight size={22} />
                </span>
                <span className="ctl-label">
                  {walk && walkPly < walk.moves.length
                    ? 'Play move'
                    : idx === steps.length - 1 && practice?.length
                      ? 'Practice'
                      : idx >= total - 1
                        ? 'Finish'
                        : 'Next'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, label, text, children }: { step: LessonStep; label: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="coach-card" key={step.title}>
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
  const end = useRevealInPanel<HTMLSpanElement>(solver.state);
  return (
    <>
      {solver.state === 'solve' && solver.hints && solver.hintLevel >= 1 && <p className="coach-hint">{solver.hints.idea}</p>}
      {solver.state === 'solve' && solver.hints && solver.hintLevel >= 2 && <p className="coach-hint">{solver.hints.piece}</p>}
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
          <button className="btn small ghost" onClick={() => void solver.reveal()}>
            Show the answer
          </button>
        </div>
      )}
      {(solver.state === 'solved' || solver.state === 'revealed') && (
        <div className="coach-section">
          {showResult && (
            <div className={`coach-result ${solver.state === 'solved' ? 'good' : ''}`}>
              {solver.state === 'solved' ? (solver.failed ? 'Solved' : 'Correct!') : 'Here’s the solution'}
            </div>
          )}
          {solver.alt && alt && <p className="coach-text faint">That works too. {alt}</p>}
          <p className="coach-text">{success}</p>
        </div>
      )}
      <span ref={end} />
    </>
  );
}

function QuizCard({ step, picked, onPick }: { step: QuizStep; picked: number | null; onPick: (i: number) => void }) {
  const chosen = picked !== null ? step.options[picked] : null;
  const why = useRevealInPanel<HTMLParagraphElement>(picked);
  return (
    <div className="coach-card" key={step.title}>
      <div className="coach-top">
        <span className="coach-step">{STEP_LABEL.quiz}</span>
      </div>
      <h3 className="coach-title">{step.title}</h3>
      <p className="coach-text">{step.text}</p>
      <div className="quiz-options">
        {step.options.map((o, i) => (
          <button key={o.label} className={`quiz-option ${picked === i ? (o.correct ? 'right' : 'wrong') : ''}`} onClick={() => onPick(i)}>
            {o.label}
          </button>
        ))}
      </div>
      {chosen && (
        <p ref={why} className={`coach-text ${chosen.correct ? '' : 'wrong-text'}`}>
          <b>{chosen.correct ? 'Yes. ' : 'Not the best. '}</b>
          {chosen.why}
        </p>
      )}
    </div>
  );
}

function PuzzleCard({ step, solver }: { step: PuzzleStep; solver: Solver }) {
  const main = sanLine(step.fen, step.line).join(' ');
  const done = solver.state === 'solved' || solver.state === 'revealed';
  return (
    <div className={`coach-card ${done && solver.state === 'solved' && !solver.failed ? 'good' : ''}`} key={step.title}>
      <div className="coach-top">
        <span className="coach-step">{STEP_LABEL.puzzle}</span>
      </div>
      <h3 className="coach-title">{step.title}</h3>
      <p className="coach-text">{step.text}</p>
      <SolverFeedback solver={solver} success={step.success} alt={`The idea of this lesson was ${main.split(' ')[0]}.`} />
      {done && <p className="coach-line">{main}</p>}
    </div>
  );
}

function PracticeCard({ puzzle, solver, n, of, graded }: { puzzle: TacticPuzzle; solver: Solver; n: number; of: number; graded?: number }) {
  const side = solver.solver === 'b' ? 'Black' : 'White';
  const done = solver.state === 'solved' || solver.state === 'revealed';
  return (
    <div className={`coach-card ${graded === 1 ? 'good' : graded === 0 && done ? 'bad' : ''}`} key={puzzle.id}>
      <div className="coach-top">
        <span className="coach-step">
          Practice {n} of {of}
        </span>
        {graded !== undefined && <span className={`pill ${graded ? 'accent' : 'danger'}`}>{graded ? 'First try' : 'Missed'}</span>}
      </div>
      <h3 className="coach-title">{done ? (solver.state === 'solved' ? (solver.failed ? 'Solved' : 'Correct!') : 'Solution') : `${side} to move`}</h3>
      {!done && solver.state !== 'wrong' && (
        <p className="coach-text">
          {puzzle.noPrev ? (
            'Find the best move. Use what you just learned.'
          ) : (
            <>
              {side === 'White' ? 'Black' : 'White'} just played <b>{sanLine(puzzle.fen, [puzzle.moves[0]])[0]}</b>. Use what you just learned.
            </>
          )}
        </p>
      )}
      <SolverFeedback solver={solver} success={explainPuzzle(puzzle)} showResult={false} />
      {done && <p className="coach-line">{solutionSan(puzzle)}</p>}
    </div>
  );
}

/** Play the position out against Stockfish until the goal is reached. */
function useDrill(step: DrillStep | null) {
  const [moves, setMoves] = useState<string[]>([]);
  const [status, setStatus] = useState<'play' | 'thinking' | 'won' | 'lost'>('play');
  const [note, setNote] = useState<string | null>(null);
  const [losses, setLosses] = useState(0);
  const token = useRef(0);
  const reset = () => {
    token.current++;
    setMoves([]);
    setStatus('play');
    setNote(null);
  };
  useEffect(() => {
    reset();
    setLosses(0);
  }, [step]);
  const chess = useMemo(() => {
    const c = new Chess(step?.fen);
    for (const u of moves) playUci(c, u);
    return c;
  }, [step, moves]);
  const userColor = (step?.fen.split(' ')[1] ?? 'w') as 'w' | 'b';

  const fail = (why: string) => {
    setStatus('lost');
    setNote(why);
    setLosses((n) => n + 1);
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
    losses,
    moveNo: Math.min(Math.ceil(moves.length / 2) + 1, step?.maxMoves ?? 0),
    dests: status === 'play' ? legalDests(chess) : undefined,
    onMove,
    reset,
  };
}
