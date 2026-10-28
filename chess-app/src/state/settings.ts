import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardId, PieceSetId, ThemeId } from '../lib/appearance';

/** A board colour, or 'auto' for the one that comes with the theme. */
export type BoardTheme = BoardId | 'auto';
export type ReviewDepth = 12 | 16 | 20;

export interface Settings {
  playerName: string;
  theme: ThemeId;
  boardTheme: BoardTheme;
  pieceSet: PieceSetId | 'auto';
  textSize: 'm' | 'l' | 'xl';
  /** Blue and orange instead of green and red for right and wrong. */
  colorblind: boolean;
  /** Write each square's name on the board. */
  squareNames: boolean;
  reduceMotion: boolean;
  /** Show moves with little piece pictures (♘f3) instead of letters (Nf3). */
  figurines: boolean;
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
      theme: 'noir',
      boardTheme: 'auto',
      pieceSet: 'auto',
      textSize: 'm',
      colorblind: false,
      squareNames: false,
      reduceMotion: false,
      figurines: true,
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
      version: 3,
      // Version 2 was the black redesign; version 3 adds themes, whose board is the default ('auto').
      migrate: (old, version) => {
        const o = { ...((old ?? {}) as Partial<Settings>) };
        if (version < 3 && (!o.boardTheme || o.boardTheme === 'green' || o.boardTheme === 'mono')) o.boardTheme = 'auto';
        return o as Settings;
      },
    },
  ),
);
