import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BoardTheme = 'mono' | 'green' | 'brown' | 'blue' | 'purple' | 'grey' | 'ice';
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
  /** Analyse the live game in the background so the review is ready sooner. */
  liveAnalysis: boolean;
  reviewDepth: ReviewDepth;
  /** Threads for the interactive analysis engine (only used when multithreading is available). */
  engineThreads: number;
  engineHash: number;
  analysisLines: number;
  showArrows: boolean;
  /** Anthropic API key for the optional AI coach (stored only in this browser). */
  aiCoachKey: string;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      playerName: 'You',
      boardTheme: 'mono',
      sound: true,
      coordinates: true,
      showLegalMoves: true,
      animation: true,
      premoves: true,
      autoQueen: false,
      autoReview: true,
      liveAnalysis: true,
      reviewDepth: 16,
      engineThreads: Math.max(1, Math.min(8, (navigator.hardwareConcurrency ?? 2) - 1)),
      engineHash: 64,
      analysisLines: 3,
      showArrows: true,
      aiCoachKey: '',
      set: (patch) => set(patch),
    }),
    {
      name: 'outpost.settings',
      version: 2,
      // Version 2 is the black redesign: boards still on the old default move to the new monochrome one.
      migrate: (old, version) => {
        const o = (old ?? {}) as Partial<Settings>;
        return (version < 2 && (!o.boardTheme || o.boardTheme === 'green') ? { ...o, boardTheme: 'mono' } : o) as Settings;
      },
    },
  ),
);
