// Progress through the course (lessons, exams, placement) and the puzzle trainer.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TacticPuzzle } from '../lib/learn/puzzles';
import { EXAM_PASS, LEVELS, examGrade, starsFor } from '../lib/learn/levels';

export interface LessonProgress {
  /** Furthest step reached. */
  step: number;
  done: boolean;
  /** Best score 0-100. */
  best?: number;
  stars?: number;
}

export interface ExamRecord {
  /** Best number of correct answers. */
  best: number;
  total: number;
  passed: boolean;
  grade: string;
  attempts: number;
  at: number;
  /** Passed through the placement test rather than the exam. */
  placed?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const dayBefore = (d: string) => new Date(new Date(d).getTime() - 86_400_000).toISOString().slice(0, 10);

interface LearnState {
  lessons: Record<string, LessonProgress>;
  exams: Record<string, ExamRecord>;
  placementDone: boolean;
  /** Puzzle rating (Elo-like) and its history. */
  rating: number;
  ratingHistory: { t: number; r: number }[];
  attempts: number;
  solved: number;
  /** Solved / failed counts per puzzle theme. */
  themes: Record<string, { ok: number; fail: number }>;
  /** Recently played puzzle ids, newest last. */
  recent: string[];
  rushBest: number;
  rushRuns: number;
  /** Consecutive days with some training. */
  streak: number;
  bestStreak: number;
  lastActive: string;
  reach: (lesson: string, step: number) => void;
  finishLesson: (lesson: string, score: number) => { stars: number; best: number; improved: boolean };
  recordExam: (levelId: string, correct: number, total: number) => ExamRecord;
  place: (levelIndex: number, rating: number) => void;
  /** Records a puzzle attempt; rated attempts move the rating. Returns the rating change. */
  record: (p: TacticPuzzle, ok: boolean, rated?: boolean) => number;
  recordRush: (score: number) => boolean;
  reset: () => void;
}

const fresh = {
  lessons: {},
  exams: {},
  placementDone: false,
  rating: 600,
  ratingHistory: [],
  attempts: 0,
  solved: 0,
  themes: {},
  recent: [],
  rushBest: 0,
  rushRuns: 0,
  streak: 0,
  bestStreak: 0,
  lastActive: '',
};

/** Streak bookkeeping for any training activity today. */
function touched(s: { streak: number; bestStreak: number; lastActive: string }) {
  const d = today();
  if (s.lastActive === d) return {};
  const streak = s.lastActive === dayBefore(d) ? s.streak + 1 : 1;
  return { streak, bestStreak: Math.max(s.bestStreak, streak), lastActive: d };
}

export const useLearn = create<LearnState>()(
  persist(
    (set, get) => ({
      ...fresh,
      reach: (lesson, step) =>
        set((s) => {
          const cur = s.lessons[lesson] ?? { step: 0, done: false };
          return step > cur.step ? { lessons: { ...s.lessons, [lesson]: { ...cur, step } } } : s;
        }),
      finishLesson: (lesson, score) => {
        const s = get();
        const cur = s.lessons[lesson] ?? { step: 0, done: false };
        const best = Math.max(cur.best ?? 0, Math.round(score));
        const stars = starsFor(best);
        set({ lessons: { ...s.lessons, [lesson]: { ...cur, done: true, best, stars } }, ...touched(s) });
        return { stars: starsFor(score), best, improved: score > (cur.best ?? -1) };
      },
      recordExam: (levelId, correct, total) => {
        const s = get();
        const prev = s.exams[levelId];
        const passed = correct >= EXAM_PASS || !!prev?.passed;
        const best = Math.max(prev?.best ?? 0, correct);
        const rec: ExamRecord = {
          best,
          total,
          passed,
          grade: examGrade(best, total),
          attempts: (prev?.attempts ?? 0) + 1,
          at: Date.now(),
          placed: prev?.placed && best < EXAM_PASS ? true : undefined,
        };
        set({ exams: { ...s.exams, [levelId]: rec }, ...touched(s) });
        return rec;
      },
      place: (levelIndex, rating) => {
        const s = get();
        const exams = { ...s.exams };
        for (const l of LEVELS.slice(0, levelIndex))
          if (!exams[l.id]?.passed) exams[l.id] = { best: 0, total: 0, passed: true, grade: 'P', attempts: 0, at: Date.now(), placed: true };
        set({
          exams,
          placementDone: true,
          // A placement only ever raises a fresh puzzle rating.
          ...(s.attempts < 10 && rating > s.rating ? { rating, ratingHistory: [...s.ratingHistory, { t: Date.now(), r: rating }] } : {}),
          ...touched(s),
        });
      },
      record: (p, ok, rated = true) => {
        const s = get();
        const themes = { ...s.themes };
        for (const t of p.themes) {
          const cur = themes[t] ?? { ok: 0, fail: 0 };
          themes[t] = ok ? { ...cur, ok: cur.ok + 1 } : { ...cur, fail: cur.fail + 1 };
        }
        let delta = 0;
        let rating = s.rating;
        if (rated) {
          const k = s.attempts < 15 ? 56 : s.attempts < 50 ? 32 : 20;
          const expected = 1 / (1 + Math.pow(10, (p.rating - s.rating) / 400));
          delta = Math.round(k * ((ok ? 1 : 0) - expected));
          rating = Math.max(100, s.rating + delta);
        }
        set({
          rating,
          ratingHistory: rated ? [...s.ratingHistory, { t: Date.now(), r: rating }].slice(-300) : s.ratingHistory,
          attempts: s.attempts + 1,
          solved: s.solved + (ok ? 1 : 0),
          themes,
          recent: [...s.recent.filter((id) => id !== p.id), p.id].slice(-600),
          ...touched(s),
        });
        return delta;
      },
      recordRush: (score) => {
        const s = get();
        const best = score > s.rushBest;
        set({ rushBest: Math.max(s.rushBest, score), rushRuns: s.rushRuns + 1, ...touched(s) });
        return best;
      },
      reset: () => set(fresh),
    }),
    {
      name: 'outpost.learn',
      version: 2,
      migrate: (old, version) => {
        const o = (old ?? {}) as Partial<LearnState>;
        if (version < 2) return { ...fresh, ...o, ratingHistory: [], solved: 0, exams: {}, placementDone: false } as unknown as LearnState;
        return o as LearnState;
      },
    },
  ),
);

/** The streak to show today: it lapses if yesterday had no training. */
export function liveStreak(s: { streak: number; lastActive: string }): number {
  const d = today();
  return s.lastActive === d || s.lastActive === dayBefore(d) ? s.streak : 0;
}

/** A fresh puzzle near the player's rating, optionally limited to some themes. */
export function pickPuzzle(all: TacticPuzzle[], rating: number, recent: string[], themes?: string[]): TacticPuzzle | null {
  const seen = new Set(recent);
  const pool = all.filter((p) => !themes?.length || p.themes.some((t) => themes.includes(t)));
  if (!pool.length) return null;
  const fresh = pool.filter((p) => !seen.has(p.id));
  const from = fresh.length ? fresh : pool;
  // Slightly above your rating on average, so the rating has room to grow.
  const target = rating + 40;
  for (const width of [150, 250, 400]) {
    const near = from.filter((p) => Math.abs(p.rating - target) <= width);
    if (near.length >= 3) return near[Math.floor(Math.random() * near.length)];
  }
  const sorted = [...from].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, 10);
  return sorted[Math.floor(Math.random() * sorted.length)];
}

/**
 * A set of puzzles for practice or an exam: spread across the themes, inside
 * the rating band where possible, avoiding recently played ones.
 */
export function pickSet(all: TacticPuzzle[], opts: { themes: string[]; band: [number, number]; n: number; recent?: string[] }): TacticPuzzle[] {
  const seen = new Set(opts.recent ?? []);
  const out: TacticPuzzle[] = [];
  const used = new Set<string>();
  const shuffle = <T>(xs: T[]) =>
    xs
      .map((x) => [Math.random(), x] as const)
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1]);
  // Unseen puzzles first, widening the band before repeating anything.
  for (const allowSeen of [false, true])
    for (const widen of [0, 150, 300, 600]) {
      const [lo, hi] = [opts.band[0] - widen, opts.band[1] + widen];
      const byTheme = opts.themes.map((t) =>
        shuffle(
          all.filter((p) => p.themes.includes(t as never) && p.rating >= lo && p.rating <= hi && !used.has(p.id) && (allowSeen || !seen.has(p.id))),
        ),
      );
      let progress = true;
      while (out.length < opts.n && progress) {
        progress = false;
        for (const list of shuffle(byTheme)) {
          const p = list.find((x) => !used.has(x.id));
          if (!p || out.length >= opts.n) continue;
          used.add(p.id);
          out.push(p);
          progress = true;
        }
      }
      if (out.length >= opts.n) return out.sort((a, b) => a.rating - b.rating);
    }
  // Easiest first, so a set ramps up.
  return out.sort((a, b) => a.rating - b.rating);
}
