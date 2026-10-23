// Progress through the tactics course and the puzzle trainer.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TacticPuzzle } from '../lib/learn/puzzles';

export interface LessonProgress {
  /** Furthest step reached. */
  step: number;
  done: boolean;
}

interface LearnState {
  lessons: Record<string, LessonProgress>;
  /** Puzzle-trainer rating (Elo-like). */
  rating: number;
  attempts: number;
  /** Solved / failed counts per puzzle theme. */
  themes: Record<string, { ok: number; fail: number }>;
  /** Recently played puzzle ids, newest last. */
  recent: string[];
  reach: (lesson: string, step: number) => void;
  complete: (lesson: string) => void;
  record: (p: TacticPuzzle, ok: boolean) => number;
}

export const useLearn = create<LearnState>()(
  persist(
    (set, get) => ({
      lessons: {},
      rating: 1000,
      attempts: 0,
      themes: {},
      recent: [],
      reach: (lesson, step) =>
        set((s) => {
          const cur = s.lessons[lesson] ?? { step: 0, done: false };
          return step > cur.step ? { lessons: { ...s.lessons, [lesson]: { ...cur, step } } } : s;
        }),
      complete: (lesson) => set((s) => ({ lessons: { ...s.lessons, [lesson]: { ...(s.lessons[lesson] ?? { step: 0 }), done: true } } })),
      record: (p, ok) => {
        const s = get();
        const k = s.attempts < 20 ? 48 : 24;
        const expected = 1 / (1 + Math.pow(10, (p.rating - s.rating) / 400));
        const delta = Math.round(k * ((ok ? 1 : 0) - expected));
        const themes = { ...s.themes };
        for (const t of p.themes) {
          const cur = themes[t] ?? { ok: 0, fail: 0 };
          themes[t] = ok ? { ...cur, ok: cur.ok + 1 } : { ...cur, fail: cur.fail + 1 };
        }
        set({
          rating: Math.max(400, s.rating + delta),
          attempts: s.attempts + 1,
          themes,
          recent: [...s.recent.filter((id) => id !== p.id), p.id].slice(-400),
        });
        return delta;
      },
    }),
    { name: 'outpost.learn' },
  ),
);

/** A fresh puzzle near the player's rating, optionally limited to some themes. */
export function pickPuzzle(all: TacticPuzzle[], rating: number, recent: string[], themes?: string[]): TacticPuzzle | null {
  const seen = new Set(recent);
  const pool = all.filter((p) => !themes?.length || p.themes.some((t) => themes.includes(t)));
  if (!pool.length) return null;
  const fresh = pool.filter((p) => !seen.has(p.id));
  const from = fresh.length ? fresh : pool;
  // Prefer puzzles within 250 points, picked at random so sessions vary.
  const near = from.filter((p) => Math.abs(p.rating - rating) <= 250);
  const choice = near.length ? near : [...from].sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating)).slice(0, 10);
  return choice[Math.floor(Math.random() * choice.length)];
}
