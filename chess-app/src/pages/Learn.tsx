import { Compass, Lock, Play, Trophy } from 'lucide-react';
import { findLesson } from '../lib/learn/curriculum';
import {
  EXAM_PASS,
  EXAM_SIZE,
  LEVELS,
  examStatus,
  lessonStatus,
  levelPassed,
  levelProgress,
  levelUnlocked,
  nextStep,
  type Level,
} from '../lib/learn/levels';
import { useTrainingFocus } from '../lib/learn/focus';
import { navigate } from '../lib/router';
import { Grade, PageHead, Ring, Stars } from '../components/ui';
import { useLearn } from '../state/learn';

function LevelBlock({ level, index }: { level: Level; index: number }) {
  const learn = useLearn();
  const unlocked = levelUnlocked(learn, index);
  const passed = levelPassed(learn, level);
  const exam = learn.exams[level.id];
  const prog = levelProgress(learn, level);
  const step = nextStep(learn);
  const exStatus = examStatus(learn, level);
  const lessonsDone = level.lessons.every((id) => learn.lessons[id]?.done);

  return (
    <section className={`level-block ${unlocked ? '' : 'locked'}`} id={level.id}>
      <div className="level-head">
        <span className="level-badge" style={{ background: level.color }}>
          {level.n}
        </span>
        <div className="lh-body">
          <div className="lh-title">{level.name}</div>
          <div className="lh-sub">{level.goal}</div>
        </div>
        {passed ? (
          <Grade g={exam?.grade ?? 'P'} />
        ) : unlocked ? (
          <span className="pill">
            {prog.done}/{prog.total}
          </span>
        ) : (
          <Lock size={18} className="faint" />
        )}
      </div>
      <div className="path">
        {level.lessons.map((id, j) => {
          const lesson = findLesson(id);
          if (!lesson) return null;
          const status = lessonStatus(learn, level, j);
          const p = learn.lessons[id];
          const current = step.kind === 'lesson' && step.lessonId === id;
          return (
            <button
              key={id}
              className={`path-node ${status} ${current ? 'current' : ''}`}
              disabled={status === 'locked'}
              onClick={() => navigate(`/learn/${id}`)}
            >
              <span className="pn-dot">{status === 'locked' ? <Lock size={16} /> : lesson.icon}</span>
              <span className="pn-body">
                <span className="pn-title">{lesson.title}</span>
                <span className="pn-sub">{lesson.summary}</span>
              </span>
              <span className="pn-end">{p?.done ? <Stars n={p.stars ?? 1} /> : current ? <span className="pill accent">Next</span> : null}</span>
            </button>
          );
        })}
        <button
          className={`path-node exam ${exStatus} ${step.kind === 'exam' && step.level.id === level.id ? 'current' : ''}`}
          disabled={exStatus === 'locked'}
          onClick={() => navigate(`/exam/${level.id}`)}
        >
          <span className="pn-dot">{exStatus === 'locked' ? <Lock size={16} /> : <Trophy size={20} />}</span>
          <span className="pn-body">
            <span className="pn-title">Level {level.n} exam</span>
            <span className="pn-sub">
              {passed && exam?.placed
                ? 'Passed by placement test'
                : passed
                  ? `Passed with ${exam?.best}/${exam?.total}`
                  : exam
                    ? `Best ${exam.best}/${exam.total} · pass mark ${EXAM_PASS}/${EXAM_SIZE}`
                    : lessonsDone || !unlocked
                      ? `${EXAM_SIZE} puzzles, no hints · pass with ${EXAM_PASS}`
                      : 'Know this already? Test out early'}
            </span>
          </span>
          <span className="pn-end">{passed && exam && !exam.placed ? <Grade g={exam.grade} /> : null}</span>
        </button>
      </div>
    </section>
  );
}

export function LearnPage() {
  const learn = useLearn();
  const focus = useTrainingFocus();
  const step = nextStep(learn);
  const level = step.kind === 'done' ? LEVELS[LEVELS.length - 1] : step.level;
  const prog = levelProgress(learn, level);
  const lesson = step.kind === 'lesson' ? findLesson(step.lessonId) : undefined;
  const fresh = !learn.placementDone && !Object.values(learn.lessons).some((l) => l.done) && !Object.keys(learn.exams).length;

  return (
    <div className="page narrow">
      <PageHead
        title="Learn"
        right={
          !learn.placementDone ? (
            <button className="btn small ghost" onClick={() => navigate('/exam/placement')}>
              <Compass size={16} /> Placement test
            </button>
          ) : undefined
        }
      />

      <section className="course-hero" style={{ ['--lvl' as string]: level.color }}>
        <div className="ch-top">
          <Ring value={prog.done / prog.total} size={68} color={level.color} label={`${prog.done}/${prog.total}`} />
          <div style={{ minWidth: 0 }}>
            <div className="ch-kicker">
              Level {level.n} of {LEVELS.length}
            </div>
            <div className="ch-title">{level.name}</div>
            <div className="ch-sub">{level.goal}</div>
          </div>
        </div>
        {step.kind === 'done' ? (
          <p className="muted" style={{ margin: 0 }}>
            You have passed every level. Keep your eye in with rated puzzles and Puzzle Rush.
          </p>
        ) : (
          <button
            className="btn primary big block"
            onClick={() => navigate(step.kind === 'lesson' ? `/learn/${step.lessonId}` : `/exam/${step.level.id}`)}
          >
            <Play size={18} fill="currentColor" />
            {step.kind === 'lesson'
              ? `${learn.lessons[step.lessonId]?.step ? 'Continue' : 'Start'}: ${lesson?.title}`
              : `Take the Level ${level.n} exam`}
          </button>
        )}
        {fresh && (
          <button className="btn block" onClick={() => navigate('/exam/placement')}>
            <Compass size={18} /> Not a beginner? Find your level (12 puzzles)
          </button>
        )}
      </section>

      {focus && (
        <div className="focus-card" style={{ marginTop: 16 }}>
          <div className="coach-label">From your games</div>
          <p>
            In your last {focus.games} reviewed game{focus.games === 1 ? '' : 's'}, <b>{focus.title.toLowerCase()}</b> cost you {focus.count} time
            {focus.count === 1 ? '' : 's'}.
          </p>
          <button className="btn primary small" onClick={() => navigate(`/learn/${focus.lesson.id}`)}>
            {focus.lesson.icon} {focus.lesson.title}
          </button>
        </div>
      )}

      {LEVELS.map((l, i) => (
        <LevelBlock key={l.id} level={l} index={i} />
      ))}
    </div>
  );
}
