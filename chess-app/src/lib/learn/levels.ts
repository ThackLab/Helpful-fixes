// The graded course: five levels, each a short run of lessons closed by an
// exam. Passing a level's exam (8 of 10) unlocks the next level; the
// placement test lets stronger players start further up.
import type { PuzzleTheme } from './tags';

export interface Level {
  id: string;
  n: number;
  name: string;
  /** What the level teaches, in one line. */
  goal: string;
  color: string;
  /** Lesson ids, in order. */
  lessons: string[];
  /** Puzzle themes the practice sets and the exam draw from. */
  examThemes: PuzzleTheme[];
  /** Puzzle rating range for the exam. */
  band: [number, number];
}

export const LEVELS: Level[] = [
  {
    id: 'l1',
    n: 1,
    name: 'Beginner',
    goal: 'Win material, and stop giving it away',
    color: '#7cb342',
    lessons: ['values', 'loose-pieces', 'defend', 'cct', 'back-rank'],
    examThemes: ['hanging', 'mateIn1', 'backRankMate'],
    band: [300, 900],
  },
  {
    id: 'l2',
    n: 2,
    name: 'Novice',
    goal: 'Double attacks: forks, pins and skewers',
    color: '#58a6e8',
    lessons: ['forks', 'pins', 'skewers', 'opening-principles', 'queen-mate'],
    examThemes: ['fork', 'pin', 'skewer', 'mateIn1'],
    band: [600, 1250],
  },
  {
    id: 'l3',
    n: 3,
    name: 'Intermediate',
    goal: 'Combinations: two moves that work together',
    color: '#a78bfa',
    lessons: ['discovered', 'remove-defender', 'fork-setups', 'smothered', 'rook-mate'],
    examThemes: ['discovered', 'doubleCheck', 'removeDefender', 'setup', 'fork', 'mateIn2'],
    band: [900, 1550],
  },
  {
    id: 'l4',
    n: 4,
    name: 'Club player',
    goal: 'Calculate forcing lines to the end',
    color: '#f4b740',
    lessons: ['overloading', 'deflection', 'promotion', 'mating-nets', 'opposition'],
    examThemes: ['sacrifice', 'setup', 'removeDefender', 'promotion', 'mateIn2', 'mateIn3'],
    band: [1200, 1850],
  },
  {
    id: 'l5',
    n: 5,
    name: 'Advanced',
    goal: 'Attack the king and see the whole line',
    color: '#ef5d4b',
    lessons: ['king-attack', 'calculation'],
    examThemes: ['sacrifice', 'mateIn3', 'setup', 'doubleCheck', 'discovered', 'mateIn2'],
    band: [1500, 2500],
  },
];

export const EXAM_SIZE = 10;
export const EXAM_PASS = 8;

export const findLevel = (id: string) => LEVELS.find((l) => l.id === id);
export const levelOfLesson = (lessonId: string) => LEVELS.find((l) => l.lessons.includes(lessonId));

/** Stars for a lesson score (0-100). Finishing a lesson always earns one. */
export function starsFor(score: number): number {
  return score >= 90 ? 3 : score >= 70 ? 2 : 1;
}

/** Letter grade for an exam result. */
export function examGrade(correct: number, total: number): string {
  const pct = correct / total;
  return pct >= 0.9 ? 'A' : pct >= EXAM_PASS / EXAM_SIZE ? 'B' : pct >= 0.6 ? 'C' : 'F';
}

export interface CourseProgress {
  lessons: Record<string, { done: boolean; stars?: number; best?: number }>;
  exams: Record<string, { passed: boolean; grade: string; best: number; placed?: boolean }>;
}

export type NodeStatus = 'locked' | 'open' | 'done';

export function levelUnlocked(p: CourseProgress, i: number): boolean {
  return i === 0 || !!p.exams[LEVELS[i - 1].id]?.passed;
}

export function levelPassed(p: CourseProgress, level: Level): boolean {
  return !!p.exams[level.id]?.passed;
}

export function lessonStatus(p: CourseProgress, level: Level, j: number): NodeStatus {
  const i = LEVELS.indexOf(level);
  if (!levelUnlocked(p, i)) return 'locked';
  const id = level.lessons[j];
  if (p.lessons[id]?.done) return 'done';
  if (levelPassed(p, level) || j === 0 || p.lessons[level.lessons[j - 1]]?.done) return 'open';
  return 'locked';
}

export function examStatus(p: CourseProgress, level: Level): NodeStatus {
  const i = LEVELS.indexOf(level);
  if (!levelUnlocked(p, i)) return 'locked';
  // The exam can be taken any time in an unlocked level: finishing the lessons first is advised, not required.
  return levelPassed(p, level) ? 'done' : 'open';
}

/** The level you are working on: the first one not passed yet. */
export function currentLevel(p: CourseProgress): Level {
  return LEVELS.find((l) => !levelPassed(p, l)) ?? LEVELS[LEVELS.length - 1];
}

export type NextStep = { kind: 'lesson'; level: Level; lessonId: string; index: number } | { kind: 'exam'; level: Level } | { kind: 'done' };

/** What "Continue" should open. */
export function nextStep(p: CourseProgress): NextStep {
  for (const level of LEVELS) {
    if (levelPassed(p, level)) continue;
    const j = level.lessons.findIndex((id) => !p.lessons[id]?.done);
    if (j >= 0) return { kind: 'lesson', level, lessonId: level.lessons[j], index: j };
    return { kind: 'exam', level };
  }
  return { kind: 'done' };
}

/** Lessons done and total for a level (a passed level counts as complete). */
export function levelProgress(p: CourseProgress, level: Level): { done: number; total: number } {
  const total = level.lessons.length + 1;
  if (levelPassed(p, level)) return { done: total, total };
  return { done: level.lessons.filter((id) => p.lessons[id]?.done).length, total };
}
