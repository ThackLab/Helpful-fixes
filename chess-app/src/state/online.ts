// Live games against people, through the relay (src/lib/online/relay.ts).
// The whole game travels in every message, with a version number: each side
// takes a state only if it is newer and its moves are legal and follow on from
// the moves it already has. The relay keeps the latest state, so a player who
// reconnects (or opens the game on another device) gets it straight away.
import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chess, type Color } from 'chess.js';
import { newCode, relay } from '../lib/online/relay';
import { moveToUci, playUci } from '../lib/chess/utils';
import { treeFromMoves, writePgn } from '../lib/chess/pgn';
import { getOpeningBook } from '../lib/chess/openings';
import { saveGame, type GameRecord, type GameResult } from '../lib/storage/db';
import { playSound, soundForSan } from '../lib/sound';
import { canMate, ruleResult } from './game';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Clock = { initial: number; increment: number };

/** What travels over the relay. */
export interface Wire {
  v: 1;
  /** Version: every change adds one. */
  n: number;
  /** The side of whoever created the game. */
  host: Color;
  /** Names; empty until that player has joined. */
  w: string;
  b: string;
  tc: Clock | null;
  /** Moves in UCI. */
  m: string[];
  /** Each side's clock after the last move, in ms. */
  c?: { w: number; b: number };
  r?: GameResult;
  t?: string;
  /** A draw offer, by this side. */
  d?: Color;
  /** A rematch offer: the new game's code, and who offered it. */
  re?: string;
  reBy?: Color;
}

export interface OnlineGame {
  code: string;
  /** The side this device plays; null when watching, undefined until joined. */
  me?: Color | null;
  s: Wire | null;
  /** Local time the side to move started thinking (for the clock). */
  turnAt: number;
  createdAt: number;
  savedId?: string;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Replays a state's moves; null if any is illegal. */
export function replay(m: string[]): { chess: Chess; sans: string[] } | null {
  const chess = new Chess(START_FEN);
  const sans: string[] = [];
  for (const u of m) {
    const mv = playUci(chess, u);
    if (!mv) return null;
    sans.push(mv.san);
  }
  return { chess, sans };
}

function valid(x: unknown): x is Wire {
  const w = x as Wire;
  return (
    !!w &&
    w.v === 1 &&
    typeof w.n === 'number' &&
    (w.host === 'w' || w.host === 'b') &&
    typeof w.w === 'string' &&
    typeof w.b === 'string' &&
    Array.isArray(w.m) &&
    w.m.every((u) => typeof u === 'string') &&
    w.w.length <= 40 &&
    w.b.length <= 40
  );
}

/** How long the side to move has left right now. */
export function timeLeft(g: OnlineGame, side: Color, now = Date.now()): number | null {
  if (!g.s?.tc || !g.s.c) return null;
  const toMove = g.s.m.length % 2 === 0 ? 'w' : 'b';
  const base = g.s.c[side];
  if (g.s.r || side !== toMove || g.s.m.length < 2) return base;
  return base - (now - g.turnAt);
}

export const tcLabel = (tc: Clock | null) => (tc ? `${tc.initial / 60_000}+${tc.increment / 1000}` : 'Untimed');

async function saveToLibrary(g: OnlineGame): Promise<string | undefined> {
  const s = g.s;
  const r = s && replay(s.m);
  if (!s || !r || !s.r) return undefined;
  const date = new Date(g.createdAt);
  const pgnDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const tree = treeFromMoves(START_FEN, s.m, {
    Event: 'Outpost online game',
    Site: 'Outpost Chess',
    Date: pgnDate,
    White: s.w,
    Black: s.b,
    Termination: s.t ?? '',
  });
  const fens = [START_FEN];
  const c = new Chess(START_FEN);
  for (const u of s.m) {
    playUci(c, u);
    fens.push(c.fen());
  }
  const rec: GameRecord = {
    id: g.savedId ?? `online-${g.code}`,
    createdAt: g.createdAt,
    source: 'online',
    white: { name: s.w || 'White', isUser: g.me === 'w' },
    black: { name: s.b || 'Black', isUser: g.me === 'b' },
    result: s.r,
    termination: s.t,
    startFen: START_FEN,
    moves: s.m,
    sans: r.sans,
    pgn: writePgn(tree, { result: s.r }),
    timeControl: tcLabel(s.tc),
    opening: getOpeningBook()?.classify(fens)?.name,
    userColor: g.me ?? undefined,
    date: pgnDate,
  };
  await saveGame(rec);
  return rec.id;
}

interface OnlineStore {
  games: OnlineGame[];
  /** Starts a game and returns its code. */
  create: (o: { tc: Clock | null; color: Color | 'random'; name: string }) => string;
  /** Starts following a code (to see who is inviting you) without taking a seat. */
  open: (code: string) => void;
  /** Takes the free seat in a game you have opened. */
  join: (code: string, name: string) => void;
  receive: (code: string, data: unknown) => void;
  move: (code: string, uci: string) => boolean;
  resign: (code: string) => void;
  abort: (code: string) => void;
  offerDraw: (code: string) => void;
  answerDraw: (code: string, accept: boolean) => void;
  /** Ends the game when a clock has run out. */
  flag: (code: string, side: Color) => void;
  /** Offers a rematch (colours swapped); returns the new game's code. */
  rematch: (code: string, name: string) => string | null;
  remove: (code: string) => void;
}

export const useOnline = create<OnlineStore>()(
  persist(
    (set, get) => {
      const find = (code: string) => get().games.find((g) => g.code === code);
      const put = (code: string, patch: (g: OnlineGame) => OnlineGame) =>
        set((st) => ({ games: st.games.map((g) => (g.code === code ? patch(g) : g)) }));

      /** Applies a change made on this device: bump the version and send it. */
      const commit = (code: string, change: (s: Wire, g: OnlineGame) => Wire | null, opts: { turn?: boolean } = {}) => {
        const g = find(code);
        if (!g?.s) return false;
        const next = change(g.s, g);
        if (!next) return false;
        const s = { ...next, n: g.s.n + 1 };
        put(code, (x) => ({ ...x, s, turnAt: opts.turn ? Date.now() : x.turnAt }));
        void relay.publishState(code, s);
        if (s.r && !g.s.r) void finished(code);
        return true;
      };

      const finished = async (code: string) => {
        const g = find(code);
        if (!g || g.savedId || g.me === undefined) return;
        const savedId = await saveToLibrary(g);
        if (savedId) put(code, (x) => ({ ...x, savedId }));
      };

      const end = (s: Wire, result: GameResult, termination: string): Wire => ({ ...s, r: result, t: termination, d: undefined });

      return {
        games: [],
        create: ({ tc, color, name }) => {
          const code = newCode();
          const host: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
          const s: Wire = {
            v: 1,
            n: 1,
            host,
            w: host === 'w' ? name : '',
            b: host === 'b' ? name : '',
            tc,
            m: [],
            c: tc ? { w: tc.initial, b: tc.initial } : undefined,
          };
          const now = Date.now();
          set((st) => ({ games: [{ code, me: host, s, turnAt: now, createdAt: now }, ...st.games] }));
          void relay.publishState(code, s);
          return code;
        },
        open: (code) => {
          if (find(code)) return;
          const now = Date.now();
          set((st) => ({ games: [{ code, s: null, turnAt: now, createdAt: now }, ...st.games] }));
        },
        join: (code, name) => {
          const g = find(code);
          if (!g?.s || g.me !== undefined) return;
          const seat = other(g.s.host);
          if (g.s[seat]) {
            put(code, (x) => ({ ...x, me: null }));
            return;
          }
          put(code, (x) => ({ ...x, me: seat }));
          commit(code, (s) => ({ ...s, [seat]: name || 'Guest' }));
        },
        receive: (code, data) => {
          const g = find(code);
          if (!g || !valid(data)) return;
          const r = replay(data.m);
          if (!r) return;
          const cur = g.s;
          if (cur && data.n <= cur.n) {
            // The relay has an older copy than ours: send ours again.
            if (data.n < cur.n) void relay.publishState(code, cur);
            return;
          }
          if (cur && (data.m.length < cur.m.length || cur.m.some((u, i) => data.m[i] !== u))) {
            void relay.publishState(code, cur);
            return;
          }
          // Only the opponent's moves can arrive: nobody else gets to move for us.
          if (cur && g.me) for (let i = cur.m.length; i < data.m.length; i++) if ((i % 2 === 0 ? 'w' : 'b') === g.me) return;
          const moved = !cur || data.m.length > cur.m.length;
          put(code, (x) => ({ ...x, s: data, turnAt: moved ? Date.now() : x.turnAt }));
          if (cur && data.m.length > cur.m.length) {
            const last = r.sans[r.sans.length - 1];
            playSound(soundForSan(last));
          }
          if (data.r && !cur?.r) {
            if (cur) playSound('end');
            void finished(code);
          }
        },
        move: (code, uci) => {
          const g = find(code);
          if (!g?.s || g.s.r || !g.me) return false;
          const s0 = g.s;
          const turn: Color = s0.m.length % 2 === 0 ? 'w' : 'b';
          if (turn !== g.me || !s0.w || !s0.b) return false;
          const r = replay(s0.m);
          if (!r) return false;
          const mv = playUci(r.chess, uci);
          if (!mv) return false;
          let clocks = s0.c;
          if (s0.tc && clocks) {
            const free = s0.m.length < 2;
            const left = clocks[turn] - (free ? 0 : Date.now() - g.turnAt);
            if (left <= 0) {
              get().flag(code, turn);
              return false;
            }
            clocks = { ...clocks, [turn]: left + (free ? 0 : s0.tc.increment) };
          }
          playSound(soundForSan(mv.san));
          const over = ruleResult(r.chess);
          return commit(
            code,
            (s) => {
              const next: Wire = { ...s, m: [...s.m, moveToUci(mv)], c: clocks, d: undefined };
              return over ? end(next, over.result, over.termination) : next;
            },
            { turn: true },
          );
        },
        resign: (code) => {
          const g = find(code);
          if (!g?.me) return;
          const me = g.me;
          commit(code, (s) => (s.r ? null : end(s, me === 'w' ? '0-1' : '1-0', 'resignation')));
        },
        abort: (code) => {
          const g = find(code);
          if (!g?.me) return;
          commit(code, (s) => (s.r || s.m.length >= 2 ? null : end(s, '*', 'aborted')));
        },
        offerDraw: (code) => {
          const g = find(code);
          if (!g?.me) return;
          const me = g.me;
          commit(code, (s) => (s.r || s.d ? null : { ...s, d: me }));
        },
        answerDraw: (code, accept) => {
          const g = find(code);
          if (!g?.me) return;
          const me = g.me;
          commit(code, (s) => (s.r || !s.d || s.d === me ? null : accept ? end(s, '1/2-1/2', 'agreement') : { ...s, d: undefined }));
        },
        flag: (code, side) => {
          commit(code, (s) => {
            if (s.r) return null;
            const r = replay(s.m);
            const winner = other(side);
            const draw = r ? !canMate(r.chess, winner) : false;
            const c = s.c ? { ...s.c, [side]: 0 } : s.c;
            return end({ ...s, c }, draw ? '1/2-1/2' : winner === 'w' ? '1-0' : '0-1', draw ? 'timeout vs insufficient material' : 'timeout');
          });
        },
        rematch: (code, name) => {
          const g = find(code);
          if (!g?.s || !g.me || !g.s.r) return null;
          if (g.s.re) return g.s.re;
          const next = get().create({ tc: g.s.tc, color: other(g.me), name });
          const me = g.me;
          commit(code, (s) => ({ ...s, re: next, reBy: me }));
          return next;
        },
        remove: (code) => set((st) => ({ games: st.games.filter((g) => g.code !== code) })),
      };
    },
    { name: 'outpost.online', version: 1 },
  ),
);

/** When each side was last heard from, per game (not saved). */
export const usePresence = create<{ seen: Record<string, Partial<Record<Color, number>>>; mark: (code: string, side: Color) => void }>()((set) => ({
  seen: {},
  mark: (code, side) => set((st) => ({ seen: { ...st.seen, [code]: { ...st.seen[code], [side]: Date.now() } } })),
}));

/** How many relays this device is connected to right now. */
export const useRelayStatus = create<{ up: number }>()(() => ({ up: 0 }));
relay.onStatus((up) => useRelayStatus.setState({ up }));

/**
 * Keeps every unfinished game (and recently finished ones, for rematch offers)
 * in sync while the app is open. Mounted once, in App.
 */
export function useOnlineSync() {
  const codes = useOnline((st) =>
    st.games
      .filter((g) => !g.s?.r || Date.now() - g.createdAt < 6 * 3_600_000)
      .map((g) => g.code)
      .join(','),
  );
  useEffect(() => {
    if (!codes) return;
    const offs: Promise<() => void>[] = codes.split(',').map((code) =>
      relay.join(code, (kind, data, from) => {
        if (kind === 'state') useOnline.getState().receive(code, data);
        else if (from === 'w' || from === 'b') usePresence.getState().mark(code, from);
      }),
    );
    return () => {
      offs.forEach((p) => void p.then((off) => off()));
    };
  }, [codes]);
}

/** While a game screen is open: tell the opponent we're here, every few seconds. */
export function useHeartbeat(code: string, me: Color | null | undefined) {
  useEffect(() => {
    if (!me) return;
    const beat = () => {
      if (document.visibilityState === 'visible') void relay.beat(code, me, { t: Date.now() });
    };
    beat();
    const t = setInterval(beat, 8000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [code, me]);
}
