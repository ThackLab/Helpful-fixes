// Background game-review jobs. Reviews keep running while you navigate and
// results are cached in IndexedDB.
import { create } from 'zustand';
import { getEval, putEval } from '../lib/review/evalCache';
import type { Color } from 'chess.js';
import { EnginePool, defaultPoolSize } from '../lib/engine/manager';
import { isMobile } from '../lib/platform';
import { loadOpeningBook } from '../lib/chess/openings';
import { analysePositions, buildReview } from '../lib/review/review';
import type { GameReview, PositionEval } from '../lib/review/types';
import { moveLesson } from '../lib/review/lessons';
import { getGame, getReview, saveReview, savePuzzles, type Puzzle } from '../lib/storage/db';
import { useSettings } from './settings';

export interface ReviewJob {
  gameId: string;
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  error?: string;
  /** Partial evaluations as they arrive, for a live graph. */
  partial: (PositionEval | undefined)[];
  depth: number;
}

interface ReviewerStore {
  jobs: Record<string, ReviewJob>;
  start: (gameId: string, opts?: { depth?: number; force?: boolean }) => Promise<GameReview | null>;
  cancel: (gameId: string) => void;
}

const controllers = new Map<string, AbortController>();
let pool: EnginePool | null = null;
let poolUsers = 0;
let poolTimer: ReturnType<typeof setTimeout> | undefined;

function acquirePool() {
  clearTimeout(poolTimer);
  pool ??= new EnginePool(defaultPoolSize(), isMobile ? 16 : 32);
  poolUsers++;
  return pool;
}

function releasePool() {
  poolUsers--;
  if (poolUsers <= 0) {
    poolUsers = 0;
    // Keep the engines warm for a minute in case another review follows.
    poolTimer = setTimeout(() => {
      pool?.terminate();
      pool = null;
    }, 60000);
  }
}

/** Turns the user's mistakes into practice positions. */
export function puzzlesFrom(review: GameReview, gameId: string, color: Color | undefined): Puzzle[] {
  const out: Puzzle[] = [];
  for (const m of review.moves) {
    if (color && m.color !== color) continue;
    if (!['blunder', 'mistake', 'miss'].includes(m.classification)) continue;
    const pos = review.positions[m.ply];
    const best = pos.lines[0];
    if (!best || !best.pv.length) continue;
    // Only positions with a clear answer make good puzzles.
    const second = pos.lines[1];
    const sign = m.color === 'w' ? 1 : -1;
    const toCp = (s: typeof best.score) => (s.type === 'mate' ? (s.value > 0 ? 10000 : -10000) : s.value) * sign;
    if (second && toCp(best.score) - toCp(second.score) < 80) continue;
    out.push({
      id: `${gameId}:${m.ply}`,
      gameId,
      ply: m.ply,
      fen: m.fenBefore,
      color: m.color,
      solution: best.pv.slice(0, 7),
      solutionSan: best.san.slice(0, 7),
      playedSan: m.san,
      classification: m.classification,
      comment: m.comment,
      lesson: (() => {
        const l = moveLesson(review, m.ply);
        return l ? { icon: l.info.icon, title: l.info.title, rule: l.info.rule } : undefined;
      })(),
      createdAt: Date.now(),
      box: 0,
      due: Date.now(),
      attempts: 0,
      solved: 0,
    });
  }
  return out;
}

export const useReviewer = create<ReviewerStore>()((set, get) => ({
  jobs: {},
  start: async (gameId, opts = {}) => {
    const existing = get().jobs[gameId];
    if (existing?.status === 'running') return null;
    if (!opts.force) {
      const cached = await getReview(gameId);
      if (cached) return cached;
    }
    const game = await getGame(gameId);
    if (!game) throw new Error('Game not found');
    const depth = opts.depth ?? useSettings.getState().reviewDepth;
    const total = game.moves.length + 1;
    const ctrl = new AbortController();
    controllers.set(gameId, ctrl);
    const update = (patch: Partial<ReviewJob>) => set((s) => ({ jobs: { ...s.jobs, [gameId]: { ...s.jobs[gameId], ...patch } } }));
    set((s) => ({
      jobs: { ...s.jobs, [gameId]: { gameId, status: 'running', done: 0, total, partial: new Array(total), depth } },
    }));
    const p = acquirePool();
    try {
      const book = await loadOpeningBook();
      const input = { startFen: game.startFen, moves: game.moves };
      const positions = await analysePositions(input, {
        engines: p.engines,
        depth,
        multipv: 3,
        maxTimeMs: depth >= 20 ? 12000 : 6000,
        cache: { get: getEval, put: putEval },
        quickDepth: Math.max(10, depth - 4),
        signal: ctrl.signal,
        onProgress: (done, tot) => update({ done, total: tot }),
        onPosition: (i, pos) => {
          const cur = get().jobs[gameId];
          if (!cur) return;
          const partial = [...cur.partial];
          partial[i] = pos;
          update({ partial });
        },
      });
      const review = buildReview(input, positions, { depth, book, userColor: game.userColor });
      await saveReview(gameId, review);
      if (game.userColor) await savePuzzles(puzzlesFrom(review, gameId, game.userColor));
      update({ status: 'done', done: total, partial: [] });
      return review;
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      if (aborted) {
        set((s) => {
          const jobs = { ...s.jobs };
          delete jobs[gameId];
          return { jobs };
        });
      } else update({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      controllers.delete(gameId);
      releasePool();
    }
  },
  cancel: (gameId) => controllers.get(gameId)?.abort(),
}));
