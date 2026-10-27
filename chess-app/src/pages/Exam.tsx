// Level exams and the placement test: puzzles in a row, no hints, one try each.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Compass, Trophy, X } from 'lucide-react';
import { Board } from '../components/Board';
import { useSolver } from '../components/useSolver';
import { explainPuzzle, type TacticPuzzle } from '../lib/learn/puzzles';
import { THEME_INFO } from '../lib/learn/tags';
import { EXAM_PASS, EXAM_SIZE, LEVELS, examGrade, findLevel, type Level } from '../lib/learn/levels';
import { START_FEN, sanLine } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound } from '../lib/sound';
import { Grade } from '../components/ui';
import { pickSet, useLearn } from '../state/learn';
import { usePuzzleBank } from './Puzzles';

/** Placement: three puzzles per level for the first four levels; two right moves you up. */
const PLACEMENT_LEVELS = 4;
const PLACEMENT_PER = 3;
const PLACEMENT_PASS = 2;

interface Item {
  puzzle: TacticPuzzle;
  level: Level;
}

export function ExamPage({ levelId }: { levelId: string }) {
  const placement = levelId === 'placement';
  const level = findLevel(levelId);
  const all = usePuzzleBank();
  const learn = useLearn();
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro');
  const [outcome, setOutcome] = useState<{ correct: number; total: number; placedAt?: number } | null>(null);
  const handled = useRef<Item | null>(null);

  // Build the paper once the puzzles have loaded.
  useEffect(() => {
    if (!all || items) return;
    const recent = useLearn.getState().recent;
    if (placement) {
      const out: Item[] = [];
      for (const l of LEVELS.slice(0, PLACEMENT_LEVELS)) {
        const mid = (l.band[0] + l.band[1]) / 2;
        for (const p of pickSet(all, { themes: l.examThemes, band: [mid - 150, mid + 150], n: PLACEMENT_PER, recent }))
          out.push({ puzzle: p, level: l });
      }
      setItems(out);
    } else if (level) {
      setItems(pickSet(all, { themes: level.examThemes, band: level.band, n: EXAM_SIZE, recent }).map((p) => ({ puzzle: p, level })));
    }
  }, [all, items, placement, level]);

  const item = phase === 'run' ? items?.[idx] : undefined;
  const input = useMemo(() => (item ? { fen: item.puzzle.fen, startMove: item.puzzle.moves[0], line: item.puzzle.moves.slice(1) } : null), [item]);
  const solver = useSolver(input);
  const done = solver.state === 'solved' || solver.state === 'revealed' || solver.state === 'wrong';
  const right = solver.state === 'solved' && !solver.failed;

  // One try: the first wrong move fails the question.
  useEffect(() => {
    if (!item || handled.current === item) return;
    if (solver.state !== 'solved' && solver.state !== 'wrong') return;
    handled.current = item;
    const ok = solver.state === 'solved' && !solver.failed;
    setResults((r) => [...r, ok]);
    useLearn.getState().record(item.puzzle, ok, true);
  }, [solver.state, solver.failed, item]);

  const finish = (res: boolean[]) => {
    if (placement && items) {
      // Your level is the first one where you missed too many.
      let placedAt = PLACEMENT_LEVELS;
      for (let i = 0; i < PLACEMENT_LEVELS; i++) {
        const got = res.slice(i * PLACEMENT_PER, (i + 1) * PLACEMENT_PER).filter(Boolean).length;
        if (got < PLACEMENT_PASS) {
          placedAt = i;
          break;
        }
      }
      learn.place(placedAt, 500 + placedAt * 300);
      setOutcome({ correct: res.filter(Boolean).length, total: res.length, placedAt });
    } else if (level) {
      const correct = res.filter(Boolean).length;
      learn.recordExam(level.id, correct, res.length);
      setOutcome({ correct, total: res.length });
      playSound(correct >= EXAM_PASS ? 'correct' : 'end');
    }
    setPhase('done');
  };

  const next = () => {
    if (!items) return;
    // The placement test stops as soon as a level is clearly too hard.
    if (placement) {
      const stage = Math.floor(idx / PLACEMENT_PER);
      const inStage = results.slice(stage * PLACEMENT_PER);
      const misses = inStage.filter((r) => !r).length;
      if (misses > PLACEMENT_PER - PLACEMENT_PASS) return finish(results);
    }
    if (idx + 1 >= items.length) return finish(results);
    setIdx(idx + 1);
  };

  if (!placement && !level) {
    return (
      <div className="page empty">
        <h2>Exam not found</h2>
        <button className="btn primary" onClick={() => navigate('/learn')}>
          Back to Learn
        </button>
      </div>
    );
  }

  const title = placement ? 'Placement test' : `Level ${level!.n} exam`;
  const total = items?.length ?? (placement ? PLACEMENT_LEVELS * PLACEMENT_PER : EXAM_SIZE);
  const side = solver.solver === 'b' ? 'Black' : 'White';
  const missedThemes = [
    ...new Set(
      (items ?? [])
        .filter((_, i) => results[i] === false)
        .flatMap((it) => it.puzzle.themes)
        .filter((t) => THEME_INFO[t].lesson),
    ),
  ];

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="player-bar lesson-top">
          <button className="icon-btn" onClick={() => navigate('/learn')} aria-label="Close">
            <X size={22} />
          </button>
          <b>{title}</b>
          <span className="spacer" />
          {phase === 'run' && (
            <span className="faint num">
              {idx + 1} / {total}
            </span>
          )}
        </div>
        <div className="lesson-progress">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={results[i] === true ? 'done' : results[i] === false ? 'miss' : i === idx && phase === 'run' ? 'cur' : ''} />
          ))}
        </div>
        <div className="board-row">
          {phase === 'run' && solver.view ? (
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
            <Board fen={START_FEN} orientation="white" viewOnly />
          )}
          {phase === 'run' && done && (
            <span className={`board-flash ${right ? 'right' : 'wrong'}`}>{right ? <Check size={26} /> : <X size={26} />}</span>
          )}
        </div>
      </div>

      <div className="side-panel">
        <div className="panel-body">
          {phase === 'intro' && (
            <div className="coach-card">
              <span className="coach-step">{placement ? 'Find your level' : `${level!.name} · final test`}</span>
              <h3 className="coach-title">
                {placement ? <Compass size={20} /> : <Trophy size={20} />} {title}
              </h3>
              <p className="coach-text">
                {placement
                  ? `Up to ${total} puzzles that get harder as you go. The test stops when they get too hard, and you start the course at that level. Levels below it count as passed.`
                  : `${EXAM_SIZE} puzzles on ${level!.examThemes
                      .map((t) => THEME_INFO[t].title.toLowerCase())
                      .slice(0, 4)
                      .join(
                        ', ',
                      )}. One try each and no hints. Get ${EXAM_PASS} right to pass and unlock ${LEVELS[level!.n] ? `Level ${level!.n + 1}` : 'the course certificate'}.`}
              </p>
              {!placement && learn.exams[level!.id] && (
                <p className="coach-line">
                  Your best: {learn.exams[level!.id].best}/{learn.exams[level!.id].total}
                </p>
              )}
            </div>
          )}
          {phase === 'run' && item && (
            <div className={`coach-card ${done ? (right ? 'good' : 'bad') : ''}`}>
              <div className="coach-top">
                <span className="coach-step">
                  Question {idx + 1}
                  {placement ? ` · Level ${item.level.n}` : ''}
                </span>
              </div>
              <h3 className="coach-title">{done ? (right ? 'Correct' : 'Not this time') : `${side} to move`}</h3>
              {!done && (
                <p className="coach-text">
                  {side === 'White' ? 'Black' : 'White'} just played <b>{sanLine(item.puzzle.fen, [item.puzzle.moves[0]])[0]}</b>. Find the best move.
                </p>
              )}
              {solver.state === 'checking' && <p className="coach-text faint">Checking your move…</p>}
              {done && (
                <>
                  {solver.state === 'wrong' && solver.message && <p className="coach-text wrong-text">{solver.message}</p>}
                  <p className="coach-text">{explainPuzzle(item.puzzle)}</p>
                  <p className="coach-line">{sanLine(item.puzzle.fen, item.puzzle.moves).slice(1).join(' ')}</p>
                </>
              )}
            </div>
          )}
          {phase === 'done' && outcome && (
            <div className="coach-card finish-card">
              {placement ? (
                <>
                  <span className="coach-step">Placement result</span>
                  <span
                    className="level-badge"
                    style={{ background: LEVELS[outcome.placedAt!].color, width: 64, height: 64, fontSize: '1.8rem', borderRadius: 20 }}
                  >
                    {outcome.placedAt! + 1}
                  </span>
                  <h3>
                    Start at Level {outcome.placedAt! + 1}: {LEVELS[outcome.placedAt!].name}
                  </h3>
                  <p className="score-line">
                    {outcome.correct} of {outcome.total} solved.
                    {outcome.placedAt! > 0
                      ? ` Levels 1${outcome.placedAt! > 1 ? `–${outcome.placedAt}` : ''} are marked as passed.`
                      : ' The course starts from the basics.'}
                  </p>
                </>
              ) : (
                <>
                  <span className="coach-step">{outcome.correct >= EXAM_PASS ? 'Level passed' : 'Not passed yet'}</span>
                  <Grade g={examGrade(outcome.correct, outcome.total)} big />
                  <h3>
                    {outcome.correct} / {outcome.total}
                  </h3>
                  <p className="score-line">
                    {outcome.correct >= EXAM_PASS
                      ? LEVELS[level!.n]
                        ? `Level ${level!.n + 1}, ${LEVELS[level!.n].name}, is now open.`
                        : 'You have finished the whole course.'
                      : `You need ${EXAM_PASS} to pass. Review the themes you missed and try again: every attempt has new puzzles.`}
                  </p>
                  {outcome.correct < EXAM_PASS && missedThemes.length > 0 && (
                    <div className="chip-row" style={{ justifyContent: 'center' }}>
                      {missedThemes.map((t) => (
                        <a key={t} className="chip" href={`#/learn/${THEME_INFO[t].lesson}`}>
                          {THEME_INFO[t].title} · lesson
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="play-controls">
          {phase === 'intro' && (
            <button className="btn primary big" onClick={() => setPhase('run')} disabled={!items?.length}>
              {items ? 'Start' : 'Loading…'} <ChevronRight size={20} />
            </button>
          )}
          {phase === 'run' && (
            <button className="ctl wide go" onClick={next} disabled={!done}>
              <span className="ctl-ico">
                <ChevronRight size={22} />
              </span>
              <span className="ctl-label">{items && idx + 1 >= items.length ? 'Finish' : 'Next'}</span>
            </button>
          )}
          {phase === 'done' && (
            <>
              {!placement && outcome && outcome.correct < EXAM_PASS && (
                <button
                  className="ctl"
                  onClick={() => {
                    setItems(null);
                    setIdx(0);
                    setResults([]);
                    setOutcome(null);
                    handled.current = null;
                    setPhase('intro');
                  }}
                >
                  <span className="ctl-ico">↻</span>
                  <span className="ctl-label">Try again</span>
                </button>
              )}
              <button className="ctl wide go" onClick={() => navigate('/learn')}>
                <span className="ctl-ico">
                  <ChevronRight size={22} />
                </span>
                <span className="ctl-label">Back to the course</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
