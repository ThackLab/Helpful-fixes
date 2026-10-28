// Local persistence (IndexedDB). Games, reviews and practice positions never
// leave the browser unless the user exports them.
import { createStore, del, entries, get, set, setMany, clear, type UseStore } from 'idb-keyval';
import type { Color } from 'chess.js';
import type { GameReview } from '../review/types';

export type GameSource = 'bot' | 'import' | 'analysis' | 'pgn' | 'local' | 'online';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface PlayerInfo {
  name: string;
  elo?: number;
  isUser?: boolean;
  botId?: string;
}

export interface GameRecord {
  id: string;
  createdAt: number;
  source: GameSource;
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  termination?: string;
  startFen: string;
  /** Mainline moves in UCI. */
  moves: string[];
  sans: string[];
  pgn: string;
  timeControl?: string;
  /** Remaining clock (ms) after each ply, when the game was timed. */
  clocks?: number[];
  opening?: string;
  userColor?: Color;
  /** Accuracy summary once reviewed (kept on the record for fast listing). */
  accuracy?: { w: number; b: number };
  reviewedAt?: number;
  url?: string;
  date?: string;
}

export interface Puzzle {
  id: string;
  gameId: string;
  ply: number;
  fen: string;
  color: Color;
  /** Engine's best line (UCI); the first move is the answer. */
  solution: string[];
  solutionSan: string[];
  playedSan: string;
  classification: string;
  comment: string;
  /** The pattern behind the mistake (see review/lessons). */
  lesson?: { icon: string; title: string; rule: string };
  createdAt: number;
  /** Leitner box (0 = new). */
  box: number;
  due: number;
  attempts: number;
  solved: number;
}

const games: UseStore = createStore('outpost-games', 'games');
const reviews: UseStore = createStore('outpost-reviews', 'reviews');
const puzzles: UseStore = createStore('outpost-puzzles', 'puzzles');

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const listeners = new Set<() => void>();
export function onDbChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const changed = () => listeners.forEach((l) => l());

export async function saveGame(g: GameRecord) {
  await set(g.id, g, games);
  changed();
}

export async function getGame(id: string): Promise<GameRecord | undefined> {
  return get(id, games);
}

export async function listGames(): Promise<GameRecord[]> {
  const all = await entries<string, GameRecord>(games);
  return all.map(([, g]) => g).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteGame(id: string) {
  await del(id, games);
  await del(id, reviews);
  const ps = await listPuzzles();
  for (const p of ps) if (p.gameId === id) await del(p.id, puzzles);
  changed();
}

export async function saveReview(gameId: string, review: GameReview) {
  await set(gameId, review, reviews);
  const g = await getGame(gameId);
  if (g) {
    g.accuracy = { w: review.white.accuracy, b: review.black.accuracy };
    g.reviewedAt = review.createdAt;
    if (review.opening && !g.opening) g.opening = review.opening.name;
    await set(gameId, g, games);
  }
  changed();
}

export async function getReview(gameId: string): Promise<GameReview | undefined> {
  return get(gameId, reviews);
}

export async function listPuzzles(): Promise<Puzzle[]> {
  const all = await entries<string, Puzzle>(puzzles);
  return all.map(([, p]) => p);
}

export async function savePuzzles(list: Puzzle[]) {
  if (!list.length) return;
  await setMany(
    list.map((p) => [p.id, p]),
    puzzles,
  );
  changed();
}

export async function savePuzzle(p: Puzzle) {
  await set(p.id, p, puzzles);
  changed();
}

export async function deletePuzzle(id: string) {
  await del(id, puzzles);
  changed();
}

export interface Backup {
  app: 'outpost-chess';
  version: 1;
  exportedAt: number;
  games: GameRecord[];
  reviews: [string, GameReview][];
  puzzles: Puzzle[];
  profile: unknown;
  /** Course and puzzle-trainer progress (newer backups only). */
  learn?: unknown;
}

export async function exportAll(profile: unknown, learn?: unknown): Promise<Backup> {
  return {
    learn,
    app: 'outpost-chess',
    version: 1,
    exportedAt: Date.now(),
    games: await listGames(),
    reviews: await entries<string, GameReview>(reviews),
    puzzles: await listPuzzles(),
    profile,
  };
}

export async function importAll(b: Backup) {
  if (b.app !== 'outpost-chess') throw new Error('Not an Outpost backup file');
  await setMany(
    b.games.map((g) => [g.id, g]),
    games,
  );
  await setMany(b.reviews, reviews);
  await setMany(
    b.puzzles.map((p) => [p.id, p]),
    puzzles,
  );
  changed();
}

export async function wipeAll() {
  await clear(games);
  await clear(reviews);
  await clear(puzzles);
  changed();
}
