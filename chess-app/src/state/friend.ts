// Games against people: pass-and-play on one device, or by link, where each
// move is sent as a link (the whole game is in it) and the other player
// answers with a link back. No server: each device keeps its own copy.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chess, type Color } from 'chess.js';
import { moveToUci, playUci } from '../lib/chess/utils';
import { getOpeningBook } from '../lib/chess/openings';
import { treeFromMoves, writePgn } from '../lib/chess/pgn';
import { newId, saveGame, type GameRecord, type GameResult } from '../lib/storage/db';
import { isAndroidApp } from '../lib/platform';
import { ruleResult } from './game';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface FriendGame {
  id: string;
  mode: 'local' | 'link';
  white: string;
  black: string;
  /** Link games: the side this device plays. */
  me?: Color;
  startFen: string;
  moves: string[];
  sans: string[];
  result?: GameResult;
  termination?: string;
  createdAt: number;
  updatedAt: number;
  /** Pass-and-play: turn the board towards the side to move. */
  autoFlip?: boolean;
  /** Pass-and-play clock, in ms, and the clock left after each ply. */
  tc?: { initial: number; increment: number } | null;
  clocks?: { w: number; b: number };
  clockHistory?: number[];
  turnStartedAt?: number | null;
  savedId?: string;
}

/** What travels in a link. */
interface Wire {
  i: string;
  w: string;
  b: string;
  f?: string;
  m: string;
  r?: GameResult;
  t?: string;
}

const toBase64Url = (s: string) =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64Url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** Where links point. The installed Android app has no public address, so it links to the web version. */
export const PUBLIC_URL = 'https://thacklab.github.io/Helpful-fixes/';
/** The address links should open: this site, or the public web version from inside the Android app. */
export function baseUrl(): string {
  const { protocol, hostname, origin, pathname } = window.location;
  if (isAndroidApp || !/^https?:$/.test(protocol) || hostname.endsWith('androidplatform.net')) return PUBLIC_URL;
  return origin + pathname;
}

export function linkFor(g: FriendGame): string {
  const wire: Wire = { i: g.id, w: g.white, b: g.black, m: g.moves.join(' ') };
  if (g.startFen !== START_FEN) wire.f = g.startFen;
  if (g.result) {
    wire.r = g.result;
    wire.t = g.termination;
  }
  return `${baseUrl()}#/friend/join?d=${toBase64Url(JSON.stringify(wire))}`;
}

export function readLink(d: string): Wire | null {
  try {
    const w = JSON.parse(fromBase64Url(d)) as Wire;
    return typeof w.i === 'string' && typeof w.m === 'string' ? w : null;
  } catch {
    return null;
  }
}

/** Replays moves, keeping only the legal prefix; null if any move is illegal. */
function replay(startFen: string, moves: string[]): { chess: Chess; sans: string[] } | null {
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return null;
  }
  const sans: string[] = [];
  for (const u of moves) {
    const m = playUci(chess, u);
    if (!m) return null;
    sans.push(m.san);
  }
  return { chess, sans };
}

export const turnOf = (g: FriendGame): Color => replay(g.startFen, g.moves)?.chess.turn() ?? 'w';

async function saveToLibrary(g: FriendGame): Promise<string> {
  const date = new Date(g.createdAt);
  const pgnDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const tree = treeFromMoves(g.startFen, g.moves, {
    Event: g.mode === 'link' ? 'Outpost game by link' : 'Outpost pass and play',
    Site: 'Outpost Chess',
    Date: pgnDate,
    White: g.white,
    Black: g.black,
    Termination: g.termination ?? '',
  });
  const fens = [g.startFen];
  const c = new Chess(g.startFen);
  for (const u of g.moves) {
    playUci(c, u);
    fens.push(c.fen());
  }
  const rec: GameRecord = {
    id: g.savedId ?? `friend-${g.id}`,
    createdAt: g.createdAt,
    source: 'local',
    white: { name: g.white, isUser: g.me === 'w' },
    black: { name: g.black, isUser: g.me === 'b' },
    result: g.result ?? '*',
    termination: g.termination,
    startFen: g.startFen,
    moves: g.moves,
    sans: g.sans,
    pgn: writePgn(tree, { result: g.result }),
    timeControl: g.tc ? `${g.tc.initial / 60_000}+${g.tc.increment / 1000}` : 'Untimed',
    clocks: g.tc ? g.clockHistory : undefined,
    opening: getOpeningBook()?.classify(fens)?.name,
    userColor: g.me,
    date: pgnDate,
  };
  await saveGame(rec);
  return rec.id;
}

interface FriendStore {
  games: FriendGame[];
  createLocal: (o: { white: string; black: string; tc: { initial: number; increment: number } | null; autoFlip: boolean }) => FriendGame;
  createLink: (o: { me: Color; myName: string; friendName: string }) => FriendGame;
  move: (id: string, uci: string) => boolean;
  undo: (id: string) => void;
  finish: (id: string, result: GameResult, termination: string) => void;
  /** Takes in a game from a link. Returns its id, or an error. */
  receive: (d: string) => { id: string } | { error: string };
  remove: (id: string) => void;
}

const update = (games: FriendGame[], id: string, patch: (g: FriendGame) => FriendGame) => games.map((g) => (g.id === id ? patch(g) : g));

export const useFriends = create<FriendStore>()(
  persist(
    (set, get) => {
      const afterFinish = (id: string) => {
        const g = get().games.find((x) => x.id === id);
        if (!g?.result || g.savedId) return;
        void saveToLibrary(g).then((savedId) => set((s) => ({ games: update(s.games, id, (x) => ({ ...x, savedId })) })));
      };
      return {
        games: [],
        createLocal: ({ white, black, tc, autoFlip }) => {
          const now = Date.now();
          const g: FriendGame = {
            id: newId(),
            mode: 'local',
            white: white || 'White',
            black: black || 'Black',
            startFen: START_FEN,
            moves: [],
            sans: [],
            createdAt: now,
            updatedAt: now,
            autoFlip,
            tc,
            clocks: tc ? { w: tc.initial, b: tc.initial } : undefined,
            clockHistory: [],
            turnStartedAt: tc ? now : null,
          };
          set((s) => ({ games: [g, ...s.games] }));
          return g;
        },
        createLink: ({ me, myName, friendName }) => {
          const now = Date.now();
          const g: FriendGame = {
            id: newId(),
            mode: 'link',
            white: (me === 'w' ? myName : friendName) || (me === 'w' ? 'You' : 'Friend'),
            black: (me === 'b' ? myName : friendName) || (me === 'b' ? 'You' : 'Friend'),
            me,
            startFen: START_FEN,
            moves: [],
            sans: [],
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ games: [g, ...s.games] }));
          return g;
        },
        move: (id, uci) => {
          const g = get().games.find((x) => x.id === id);
          if (!g || g.result) return false;
          const r = replay(g.startFen, g.moves);
          if (!r) return false;
          if (g.mode === 'link' && r.chess.turn() !== g.me) return false;
          const mover = r.chess.turn();
          const m = playUci(r.chess, uci);
          if (!m) return false;
          const now = Date.now();
          let clocks = g.clocks;
          let clockHistory = g.clockHistory;
          if (g.tc && clocks) {
            const free = g.moves.length < 2;
            const spent = g.turnStartedAt ? now - g.turnStartedAt : 0;
            clocks = { ...clocks, [mover]: Math.max(0, clocks[mover] - (free ? 0 : spent)) + (free ? 0 : g.tc.increment) };
            clockHistory = [...(clockHistory ?? []), clocks[mover]];
          }
          const end = ruleResult(r.chess);
          set((s) => ({
            games: update(s.games, id, (x) => ({
              ...x,
              moves: [...x.moves, moveToUci(m)],
              sans: [...x.sans, m.san],
              clocks,
              clockHistory,
              turnStartedAt: g.tc ? now : null,
              updatedAt: now,
              ...(end ? { result: end.result, termination: end.termination } : {}),
            })),
          }));
          if (end) afterFinish(id);
          return true;
        },
        undo: (id) =>
          set((s) => ({
            games: update(s.games, id, (g) =>
              g.mode !== 'local' || g.result || !g.moves.length
                ? g
                : {
                    ...g,
                    moves: g.moves.slice(0, -1),
                    sans: g.sans.slice(0, -1),
                    clockHistory: g.clockHistory?.slice(0, -1),
                    updatedAt: Date.now(),
                  },
            ),
          })),
        finish: (id, result, termination) => {
          set((s) => ({
            games: update(s.games, id, (g) => (g.result ? g : { ...g, result, termination, turnStartedAt: null, updatedAt: Date.now() })),
          }));
          afterFinish(id);
        },
        receive: (d) => {
          const w = readLink(d);
          if (!w) return { error: 'That link is damaged. Ask for it to be sent again.' };
          const moves = w.m ? w.m.split(' ').filter(Boolean) : [];
          const startFen = w.f ?? START_FEN;
          const r = replay(startFen, moves);
          if (!r) return { error: 'That link has an illegal move in it.' };
          const mine = get().games.find((g) => g.id === w.i);
          const now = Date.now();
          if (!mine) {
            // Whoever opens a link where it's someone's move plays that side.
            const g: FriendGame = {
              id: w.i,
              mode: 'link',
              white: w.w,
              black: w.b,
              me: w.r ? undefined : r.chess.turn(),
              startFen,
              moves,
              sans: r.sans,
              result: w.r,
              termination: w.t,
              createdAt: now,
              updatedAt: now,
            };
            set((s) => ({ games: [g, ...s.games] }));
            if (w.r) afterFinish(g.id);
            return { id: g.id };
          }
          const prefix = (a: string[], b: string[]) => a.every((u, i) => b[i] === u);
          if (moves.length >= mine.moves.length && prefix(mine.moves, moves)) {
            set((s) => ({
              games: update(s.games, w.i, (g) => ({
                ...g,
                moves,
                sans: r.sans,
                result: g.result ?? w.r,
                termination: g.termination ?? w.t,
                updatedAt: now,
              })),
            }));
            if (w.r) afterFinish(w.i);
            return { id: w.i };
          }
          if (prefix(moves, mine.moves)) return { id: w.i }; // an older link: this device is already further on
          return { error: 'This link doesn’t match your copy of the game: the two of you have different moves.' };
        },
        remove: (id) => set((s) => ({ games: s.games.filter((g) => g.id !== id) })),
      };
    },
    { name: 'outpost.friends', version: 1 },
  ),
);
