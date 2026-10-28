// The daily plan: a few minutes of the training that helps most today, made
// from what you need (your own mistakes coming due, your weakest puzzle theme,
// the next lesson) and ticked off as you do it.
import { findLesson } from './curriculum';
import { LEVELS, nextStep, type CourseProgress } from './levels';
import { THEME_INFO, type PuzzleTheme } from './tags';
import type { DayLog } from '../../state/learn';

export interface PlanItem {
  id: 'mistakes' | 'puzzles' | 'lesson' | 'openings' | 'game';
  title: string;
  sub: string;
  done: boolean;
  /** Progress towards the target, when it is a count. */
  count?: [number, number];
  href?: string;
}

export const DAILY_PUZZLES = 5;
const DAILY_MISTAKES = 5;

/** The puzzle theme with the worst record (at least a few tries), if any is clearly weak. */
export function weakestTheme(themes: Record<string, { ok: number; fail: number }>): { theme: PuzzleTheme; pct: number } | null {
  let worst: { theme: PuzzleTheme; pct: number } | null = null;
  for (const [t, r] of Object.entries(themes)) {
    const n = r.ok + r.fail;
    if (n < 4 || !(t in THEME_INFO)) continue;
    const pct = r.ok / n;
    if (pct < 0.8 && (!worst || pct < worst.pct)) worst = { theme: t as PuzzleTheme, pct };
  }
  return worst;
}

export interface PlanInput {
  learn: CourseProgress & { themes: Record<string, { ok: number; fail: number }> };
  day: DayLog;
  /** Positions from your games due for practice right now. */
  due: number;
  /** Games finished today. */
  gamesToday: number;
  opponent: string;
  /** Opening lines due in your repertoire, and where to drill them. */
  openingsDue?: number;
  openingsHref?: string;
}

export function todayPlan({ learn, day, due, gamesToday, opponent, openingsDue = 0, openingsHref = '/openings' }: PlanInput): PlanItem[] {
  const items: PlanItem[] = [];

  // Your own mistakes come first: they are the positions you actually get wrong.
  if (due > 0 || day.practice > 0) {
    const target = Math.min(DAILY_MISTAKES, due + day.practice);
    items.push({
      id: 'mistakes',
      title: 'Fix your mistakes',
      sub: due > 0 ? `${due} position${due === 1 ? '' : 's'} from your games ${due === 1 ? 'is' : 'are'} due` : 'All caught up',
      done: day.practice >= target || due === 0,
      count: [Math.min(day.practice, target), target],
      href: '/practice',
    });
  }

  const weak = weakestTheme(learn.themes);
  items.push({
    id: 'puzzles',
    title: weak ? `${DAILY_PUZZLES} puzzles · ${THEME_INFO[weak.theme].title}` : `${DAILY_PUZZLES} rated puzzles`,
    sub: weak ? `Your weakest pattern lately: ${Math.round(weak.pct * 100)}% solved` : 'Warm up your tactics',
    done: day.puzzles >= DAILY_PUZZLES,
    count: [Math.min(day.puzzles, DAILY_PUZZLES), DAILY_PUZZLES],
    href: weak ? `/puzzles/play?theme=${weak.theme}` : '/puzzles/play',
  });

  const step = nextStep(learn);
  if (step.kind === 'lesson') {
    const lesson = findLesson(step.lessonId);
    items.push({
      id: 'lesson',
      title: lesson ? `Lesson: ${lesson.title}` : 'Your next lesson',
      sub: `Level ${step.level.n} · ${step.level.name}`,
      done: day.lessons + day.exams > 0,
      href: `/learn/${step.lessonId}`,
    });
  } else if (step.kind === 'exam') {
    items.push({
      id: 'lesson',
      title: `Level ${step.level.n} exam`,
      sub: 'Pass it to unlock the next level',
      done: day.lessons + day.exams > 0,
      href: `/exam/${step.level.id}`,
    });
  } else {
    items.push({
      id: 'lesson',
      title: 'A round of Puzzle Rush',
      sub: `All ${LEVELS.length} levels passed. Stay sharp.`,
      done: day.rush > 0,
      href: '/puzzles/rush',
    });
  }

  if (openingsDue > 0 || day.openings > 0) {
    const target = Math.min(3, openingsDue + day.openings);
    items.push({
      id: 'openings',
      title: 'Drill your openings',
      sub: openingsDue > 0 ? `${openingsDue} line${openingsDue === 1 ? '' : 's'} due` : 'All caught up',
      done: day.openings >= target || openingsDue === 0,
      count: [Math.min(day.openings, target), target],
      href: openingsHref,
    });
  }

  items.push({
    id: 'game',
    title: `Play ${opponent}`,
    sub: 'Then read the review: it’s where the lessons come from',
    done: gamesToday > 0,
  });
  return items;
}
