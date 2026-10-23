import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RatingPoint {
  t: number;
  rating: number;
}

export interface Profile {
  /** Rating estimated from results against bots (Elo, provisional at first). */
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  history: RatingPoint[];
  recordResult: (opponentElo: number, score: 0 | 0.5 | 1) => number;
  setRating: (r: number) => void;
}

export const useProfile = create<Profile>()(
  persist(
    (set, get) => ({
      rating: 1000,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      history: [],
      recordResult: (opp, score) => {
        const s = get();
        const k = s.games < 10 ? 60 : s.games < 30 ? 36 : 24;
        const expected = 1 / (1 + Math.pow(10, (opp - s.rating) / 400));
        const delta = Math.round(k * (score - expected));
        const rating = Math.max(100, s.rating + delta);
        set({
          rating,
          games: s.games + 1,
          wins: s.wins + (score === 1 ? 1 : 0),
          losses: s.losses + (score === 0 ? 1 : 0),
          draws: s.draws + (score === 0.5 ? 1 : 0),
          history: [...s.history, { t: Date.now(), rating }].slice(-500),
        });
        return delta;
      },
      setRating: (r) => set({ rating: r, history: [...get().history, { t: Date.now(), rating: r }] }),
    }),
    { name: 'outpost.profile', version: 1 },
  ),
);
