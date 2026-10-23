import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BoardTheme = 'green' | 'brown' | 'blue' | 'purple' | 'grey' | 'ice';
export type ReviewDepth = 12 | 16 | 20;

export interface Settings {
  playerName: string;
  boardTheme: BoardTheme;
  sound: boolean;
  coordinates: boolean;
  showLegalMoves: boolean;
  animation: boolean;
  premoves: boolean;
  autoQueen: boolean;
  /** Run the game review automatically after each game. */
  autoReview: boolean;
  reviewDepth: ReviewDepth;
  /** Threads for the interactive analysis engine (only used when multithreading is available). */
  engineThreads: number;
  engineHash: number;
  analysisLines: number;
  showArrows: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      playerName: 'You',
      boardTheme: 'green',
      sound: true,
      coordinates: true,
      showLegalMoves: true,
      animation: true,
      premoves: true,
      autoQueen: false,
      autoReview: true,
      reviewDepth: 16,
      engineThreads: Math.max(1, Math.min(8, (navigator.hardwareConcurrency ?? 2) - 1)),
      engineHash: 64,
      analysisLines: 3,
      showArrows: true,
      set: (patch) => set(patch),
    }),
    { name: 'outpost.settings', version: 1 },
  ),
);
