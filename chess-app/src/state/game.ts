import { Chess, type Color } from 'chess.js';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { findBot, type BotProfile } from '../lib/bots/bots';
import { treeFromMoves, writePgn } from '../lib/chess/pgn';
import { getOpeningBook } from '../lib/chess/openings';
import { START_FEN, moveToUci } from '../lib/chess/utils';
import { newId, saveGame, type GameRecord, type GameResult } from '../lib/storage/db';
import { useProfile } from './profile';
import { useSettings } from './settings';

export interface TimeControl {
  /** Initial time in ms. */
  initial: number;
  /** Increment per move in ms. */
  increment: number;
}

export interface ChatLine {
  from: 'bot' | 'system';
  text: string;
  t: number;
}

export interface LiveGame {
  id: string;
  botId: string;
  userColor: Color;
  startFen: string;
  moves: string[];
  sans: string[];
  timeControl: TimeControl | null;
  clocks: { w: number; b: number };
  /** Clock left for the mover after each ply. */
  clockHistory: number[];
  /** When the side to move started thinking (epoch ms); null when paused. */
  turnStartedAt: number | null;
  status: 'playing' | 'over';
  result?: GameResult;
  termination?: string;
  options: { takebacks: boolean; hints: boolean; evalBar: boolean };
  hintsUsed: number;
  takebacksUsed: number;
  chat: ChatLine[];
  createdAt: number;
  ratingDelta?: number;
  savedId?: string;
}

export interface NewGameOptions {
  botId: string;
  userColor: Color;
  startFen?: string;
  timeControl: TimeControl | null;
  takebacks: boolean;
  hints: boolean;
  evalBar: boolean;
}

interface GameStore {
  game: LiveGame | null;
  start: (o: NewGameOptions) => LiveGame;
  applyMove: (uci: string) => boolean;
  takeback: () => void;
  finish: (result: GameResult, termination: string) => void;
  say: (from: ChatLine['from'], text: string) => void;
  markHint: () => void;
  clear: () => void;
}

export function chessOf(g: Pick<LiveGame, 'startFen' | 'moves'>): Chess {
  const c = new Chess(g.startFen);
  for (const u of g.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c;
}

export function liveBot(g: LiveGame): BotProfile {
  return findBot(g.botId) ?? findBot('hugo')!;
}

/** Ends the game automatically if the position is decided by the rules. */
export function ruleResult(chess: Chess): { result: GameResult; termination: string } | null {
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  if (chess.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'threefold repetition' };
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', termination: '50-move rule' };
  return null;
}

/** Whether `color` could ever checkmate with its remaining material (for timeouts). */
export function canMate(chess: Chess, color: Color): boolean {
  const pieces = chess
    .board()
    .flat()
    .filter((p) => p && p.color === color && p.type !== 'k');
  if (pieces.some((p) => p!.type === 'p' || p!.type === 'q' || p!.type === 'r')) return true;
  return pieces.length >= 2;
}

function tcLabel(tc: TimeControl | null) {
  if (!tc) return 'Untimed';
  return `${tc.initial / 60000}+${tc.increment / 1000}`;
}

async function persistFinished(g: LiveGame): Promise<string> {
  const bot = liveBot(g);
  const name = useSettings.getState().playerName || 'You';
  const rating = useProfile.getState().rating;
  const user = { name, elo: rating, isUser: true };
  const botInfo = { name: bot.name, elo: bot.elo, botId: bot.id };
  const white = g.userColor === 'w' ? user : botInfo;
  const black = g.userColor === 'w' ? botInfo : user;
  const date = new Date(g.createdAt);
  const pgnDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const tree = treeFromMoves(g.startFen, g.moves, {
    Event: `Outpost vs ${bot.name}`,
    Site: 'Outpost Chess',
    Date: pgnDate,
    White: white.name,
    Black: black.name,
    WhiteElo: String(white.elo),
    BlackElo: String(black.elo),
    TimeControl: g.timeControl ? `${g.timeControl.initial / 1000}+${g.timeControl.increment / 1000}` : '-',
    Termination: g.termination ?? '',
  });
  const fens = [g.startFen];
  const c = new Chess(g.startFen);
  for (const u of g.moves) {
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    fens.push(c.fen());
  }
  const rec: GameRecord = {
    id: g.savedId ?? g.id,
    createdAt: g.createdAt,
    source: 'bot',
    white,
    black,
    result: g.result ?? '*',
    termination: g.termination,
    startFen: g.startFen,
    moves: g.moves,
    sans: g.sans,
    pgn: writePgn(tree, { result: g.result }),
    timeControl: tcLabel(g.timeControl),
    clocks: g.timeControl ? g.clockHistory : undefined,
    opening: getOpeningBook()?.classify(fens)?.name,
    userColor: g.userColor,
    date: pgnDate,
  };
  await saveGame(rec);
  return rec.id;
}

export const useLiveGame = create<GameStore>()(
  persist(
    (set, get) => ({
      game: null,
      start: (o) => {
        const tc = o.timeControl;
        const game: LiveGame = {
          id: newId(),
          botId: o.botId,
          userColor: o.userColor,
          startFen: o.startFen ?? START_FEN,
          moves: [],
          sans: [],
          timeControl: tc,
          clocks: { w: tc?.initial ?? 0, b: tc?.initial ?? 0 },
          clockHistory: [],
          turnStartedAt: Date.now(),
          status: 'playing',
          options: { takebacks: o.takebacks, hints: o.hints, evalBar: o.evalBar },
          hintsUsed: 0,
          takebacksUsed: 0,
          chat: [],
          createdAt: Date.now(),
        };
        set({ game });
        return game;
      },
      applyMove: (uci) => {
        const g = get().game;
        if (!g || g.status !== 'playing') return false;
        const chess = chessOf(g);
        const mover = chess.turn();
        let m;
        try {
          m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        } catch {
          return false;
        }
        const now = Date.now();
        const clocks = { ...g.clocks };
        const clockHistory = [...g.clockHistory];
        if (g.timeControl) {
          const spent = g.turnStartedAt ? now - g.turnStartedAt : 0;
          // The first move of each side is free (as on most sites).
          const free = g.moves.length < 2;
          clocks[mover] = Math.max(0, clocks[mover] - (free ? 0 : spent)) + (free ? 0 : g.timeControl.increment);
          clockHistory.push(clocks[mover]);
        }
        const next: LiveGame = {
          ...g,
          moves: [...g.moves, moveToUci(m)],
          sans: [...g.sans, m.san],
          clocks,
          clockHistory,
          turnStartedAt: now,
        };
        set({ game: next });
        const end = ruleResult(chess);
        if (end) get().finish(end.result, end.termination);
        return true;
      },
      takeback: () => {
        const g = get().game;
        if (!g || g.status !== 'playing') return;
        const chess = chessOf(g);
        // Undo until it's the user's move again (one or two plies).
        let n = chess.turn() === g.userColor ? 2 : 1;
        n = Math.min(n, g.moves.length);
        if (chess.turn() === g.userColor && g.moves.length === 1) n = 0; // bot moved first, nothing of ours to undo
        if (!n) return;
        set({
          game: {
            ...g,
            moves: g.moves.slice(0, -n),
            sans: g.sans.slice(0, -n),
            clockHistory: g.clockHistory.slice(0, -n),
            takebacksUsed: g.takebacksUsed + 1,
            turnStartedAt: Date.now(),
          },
        });
      },
      finish: (result, termination) => {
        const g = get().game;
        if (!g || g.status !== 'playing') return;
        const now = Date.now();
        const clocks = { ...g.clocks };
        if (g.timeControl && g.turnStartedAt && g.moves.length >= 2) {
          const turn = chessOf(g).turn();
          clocks[turn] = Math.max(0, clocks[turn] - (now - g.turnStartedAt));
        }
        const userScore = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (g.userColor === 'w') ? 1 : 0;
        // Very short games (aborts) don't count towards your rating.
        const rated = g.moves.length >= 4 && result !== '*';
        const delta = rated ? useProfile.getState().recordResult(liveBot(g).elo, userScore as 0 | 0.5 | 1) : undefined;
        const done: LiveGame = { ...g, status: 'over', result, termination, clocks, turnStartedAt: null, ratingDelta: delta };
        set({ game: done });
        void persistFinished(done).then((id) => {
          const cur = get().game;
          if (cur && cur.id === done.id) set({ game: { ...cur, savedId: id } });
        });
      },
      say: (from, text) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, chat: [...g.chat.slice(-20), { from, text, t: Date.now() }] } });
      },
      markHint: () => {
        const g = get().game;
        if (g) set({ game: { ...g, hintsUsed: g.hintsUsed + 1 } });
      },
      clear: () => set({ game: null }),
    }),
    { name: 'outpost.live-game', version: 1 },
  ),
);
