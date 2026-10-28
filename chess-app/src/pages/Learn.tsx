import { BookOpen, Check, Compass, Crown, Lock, Map as MapIcon, Trophy } from 'lucide-react';
import { findLesson } from '../lib/learn/curriculum';
import { COURSES, type Course } from '../lib/learn/courses';
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
import { Grade, ListRow, PageHead, Ring, Stars } from '../components/ui';
import { useRepertoire } from '../state/repertoire';
import { dueLines, usePackLines } from './Openings';
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
        <span className="level-badge">{level.n}</span>
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
              <span className="pn-dot">
                {status === 'locked' ? <Lock size={13} /> : status === 'done' ? <Check size={15} strokeWidth={2.5} /> : j + 1}
              </span>
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

const COURSE_ICON: Record<string, typeof Crown> = { strategy: MapIcon, endgames: Crown };

/** A course outside the levels: every lesson is open from the start. */
function CourseBlock({ course }: { course: Course }) {
  const learn = useLearn();
  const done = course.lessons.filter((id) => learn.lessons[id]?.done).length;
  const nextId = course.lessons.find((id) => !learn.lessons[id]?.done);
  const Icon = COURSE_ICON[course.id] ?? BookOpen;
  return (
    <section className="level-block course-block" id={course.id}>
      <div className="level-head">
        <span className="level-badge">
          <Icon size={18} />
        </span>
        <div className="lh-body">
          <div className="lh-title">{course.name}</div>
          <div className="lh-sub">{course.goal}</div>
        </div>
        <span className="pill">
          {done}/{course.lessons.length}
        </span>
      </div>
      <div className="path">
        {course.lessons.map((id, j) => {
          const lesson = findLesson(id);
          if (!lesson) return null;
          const p = learn.lessons[id];
          const current = id === nextId && done > 0;
          return (
            <button
              key={id}
              className={`path-node ${p?.done ? 'done' : 'open'} ${current ? 'current' : ''}`}
              onClick={() => navigate(`/learn/${id}?course=${course.id}`)}
            >
              <span className="pn-dot">{p?.done ? <Check size={15} strokeWidth={2.5} /> : j + 1}</span>
              <span className="pn-body">
                <span className="pn-title">{lesson.title}</span>
                <span className="pn-sub">{lesson.summary}</span>
              </span>
              <span className="pn-end">{p?.done ? <Stars n={p.stars ?? 1} /> : current ? <span className="pill accent">Next</span> : null}</span>
            </button>
          );
        })}
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
  const repertoire = useRepertoire();
  const packLines = usePackLines();
  const due = dueLines(packLines, repertoire.selected, repertoire.lines);
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

      <section className="course-hero">
        <div className="ch-top">
          <Ring value={prog.done / prog.total} size={64} stroke={2} label={`${prog.done}/${prog.total}`} />
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
            {focus.lesson.title}
          </button>
        </div>
      )}

      <div className="list" style={{ marginTop: 16 }}>
        <ListRow
          icon={<BookOpen size={20} />}
          title="Opening repertoire"
          sub={
            repertoire.selected.length
              ? `${repertoire.selected.length} opening${repertoire.selected.length === 1 ? '' : 's'} · ${due} line${due === 1 ? '' : 's'} due`
              : 'Pick your openings and drill them line by line'
          }
          href="/openings"
        />
        {COURSES.map((c) => {
          const Icon = COURSE_ICON[c.id] ?? BookOpen;
          const done = c.lessons.filter((id) => learn.lessons[id]?.done).length;
          return (
            <ListRow
              key={c.id}
              icon={<Icon size={20} />}
              title={`${c.name} course`}
              sub={done ? `${done} of ${c.lessons.length} lessons done` : c.goal}
              onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
          );
        })}
      </div>

      {LEVELS.map((l, i) => (
        <LevelBlock key={l.id} level={l} index={i} />
      ))}

      <h2 className="section-title course-title">More courses</h2>
      {COURSES.map((c) => (
        <CourseBlock key={c.id} course={c} />
      ))}
    </div>
  );
}
