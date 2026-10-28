import { describe, expect, it } from 'vitest';
import { COURSES } from './courses';
import { LESSONS, LESSON_FOR_THEME, findLesson } from './curriculum';
import {
  EXAM_PASS,
  LEVELS,
  examGrade,
  examStatus,
  lessonStatus,
  levelProgress,
  levelUnlocked,
  nextStep,
  starsFor,
  type CourseProgress,
} from './levels';
import { THEME_INFO } from './tags';
import type { TacticPuzzle } from './puzzles';
import { pickSet } from '../../state/learn';

const empty = (): CourseProgress => ({ lessons: {}, exams: {} });
const doneAll = (p: CourseProgress, levelIndex: number) => {
  for (const id of LEVELS[levelIndex].lessons) p.lessons[id] = { done: true, stars: 3, best: 100 };
};

describe('course structure', () => {
  it('every lesson a level lists exists, and each is used once', () => {
    const ids = LEVELS.flatMap((l) => l.lessons);
    for (const id of ids) expect(findLesson(id), id).toBeTruthy();
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every lesson is part of a level or a course', () => {
    const ids = new Set([...LEVELS.flatMap((l) => l.lessons), ...COURSES.flatMap((c) => c.lessons)]);
    for (const l of LESSONS) expect(ids.has(l.id), l.id).toBe(true);
  });
  it('every lesson a course lists exists, once per course', () => {
    for (const c of COURSES) {
      for (const id of c.lessons) expect(findLesson(id), id).toBeTruthy();
      expect(new Set(c.lessons).size).toBe(c.lessons.length);
    }
  });
  it('lesson links from reviews and puzzle themes point at real lessons', () => {
    for (const id of Object.values(LESSON_FOR_THEME)) expect(findLesson(id), id).toBeTruthy();
    for (const t of Object.values(THEME_INFO)) if (t.lesson) expect(findLesson(t.lesson), t.lesson).toBeTruthy();
  });
});

describe('progression', () => {
  it('starts with the first lesson of level 1', () => {
    const s = nextStep(empty());
    expect(s.kind).toBe('lesson');
    if (s.kind === 'lesson') expect(s.lessonId).toBe(LEVELS[0].lessons[0]);
  });
  it('unlocks lessons one at a time', () => {
    const p = empty();
    expect(lessonStatus(p, LEVELS[0], 0)).toBe('open');
    expect(lessonStatus(p, LEVELS[0], 1)).toBe('locked');
    p.lessons[LEVELS[0].lessons[0]] = { done: true };
    expect(lessonStatus(p, LEVELS[0], 0)).toBe('done');
    expect(lessonStatus(p, LEVELS[0], 1)).toBe('open');
  });
  it('offers the exam after the lessons, and the next level after the exam', () => {
    const p = empty();
    doneAll(p, 0);
    expect(nextStep(p)).toMatchObject({ kind: 'exam', level: LEVELS[0] });
    expect(levelUnlocked(p, 1)).toBe(false);
    p.exams[LEVELS[0].id] = { passed: true, grade: 'A', best: 10 };
    expect(levelUnlocked(p, 1)).toBe(true);
    expect(nextStep(p)).toMatchObject({ kind: 'lesson', lessonId: LEVELS[1].lessons[0] });
    expect(levelProgress(p, LEVELS[0])).toEqual({ done: LEVELS[0].lessons.length + 1, total: LEVELS[0].lessons.length + 1 });
  });
  it('lets you test out of an open level, but not a locked one', () => {
    const p = empty();
    expect(examStatus(p, LEVELS[0])).toBe('open');
    expect(examStatus(p, LEVELS[1])).toBe('locked');
  });
  it('a placement pass opens every lesson of the passed level', () => {
    const p = empty();
    p.exams[LEVELS[0].id] = { passed: true, grade: 'P', best: 0, placed: true };
    expect(LEVELS[0].lessons.map((_, j) => lessonStatus(p, LEVELS[0], j))).toEqual(LEVELS[0].lessons.map(() => 'open'));
    expect(nextStep(p)).toMatchObject({ kind: 'lesson', lessonId: LEVELS[1].lessons[0] });
  });
  it('is done when every level is passed', () => {
    const p = empty();
    for (const l of LEVELS) p.exams[l.id] = { passed: true, grade: 'B', best: 8 };
    expect(nextStep(p).kind).toBe('done');
  });
});

describe('grading', () => {
  it('gives stars for lesson scores', () => {
    expect([100, 90, 89, 70, 69, 0].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1]);
  });
  it('grades exams, passing from the pass mark', () => {
    expect([10, 9, 8, 7, 6, 3].map((n) => examGrade(n, 10))).toEqual(['A', 'A', 'B', 'C', 'C', 'F']);
    expect(examGrade(EXAM_PASS, 10)).not.toBe('C');
  });
});

describe('puzzle sets', () => {
  const bank: TacticPuzzle[] = [];
  for (let i = 0; i < 60; i++)
    bank.push({ id: `p${i}`, fen: '', moves: [], themes: [i % 3 === 0 ? 'fork' : i % 3 === 1 ? 'pin' : 'hanging'], rating: 400 + i * 25 });
  it('spreads a set over the themes, inside the band, easiest first', () => {
    const set = pickSet(bank, { themes: ['fork', 'pin'], band: [600, 1200], n: 6 });
    expect(set).toHaveLength(6);
    expect(new Set(set.map((p) => p.themes[0]))).toEqual(new Set(['fork', 'pin']));
    for (const p of set) expect(p.rating >= 600 && p.rating <= 1200).toBe(true);
    expect(set.map((p) => p.rating)).toEqual([...set.map((p) => p.rating)].sort((a, b) => a - b));
  });
  it('widens the band when it has to', () => {
    const set = pickSet(bank, { themes: ['fork'], band: [2000, 2100], n: 4 });
    expect(set).toHaveLength(4);
  });
  it('prefers puzzles you have not seen', () => {
    const recent = bank.filter((p) => p.themes[0] === 'pin' && p.rating <= 1000).map((p) => p.id);
    const set = pickSet(bank, { themes: ['pin'], band: [400, 1000], n: 2, recent });
    expect(set.every((p) => !recent.includes(p.id))).toBe(true);
  });
});
