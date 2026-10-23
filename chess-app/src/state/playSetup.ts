// The last game setup (opponent, colour, clock, assistance), shared by the Play and Home pages.
import type { Color } from 'chess.js';
import { BOTS, customBot, findBot, type BotProfile } from '../lib/bots/bots';
import { START_FEN } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound } from '../lib/sound';
import { useLiveGame, type TimeControl } from './game';

export const TIME_CONTROLS: { label: string; tc: TimeControl | null }[] = [
  { label: 'No clock', tc: null },
  { label: '1 min', tc: { initial: 60_000, increment: 0 } },
  { label: '3 | 2', tc: { initial: 180_000, increment: 2000 } },
  { label: '5 min', tc: { initial: 300_000, increment: 0 } },
  { label: '10 min', tc: { initial: 600_000, increment: 0 } },
  { label: '15 | 10', tc: { initial: 900_000, increment: 10_000 } },
  { label: '30 min', tc: { initial: 1_800_000, increment: 0 } },
];

const LS_KEY = 'outpost.play-setup';

export interface Setup {
  botId: string;
  color: 'w' | 'b' | 'random';
  tc: number;
  takebacks: boolean;
  hints: boolean;
  evalBar: boolean;
  customElo: number;
}

const DEFAULT: Setup = { botId: 'hugo', color: 'w', tc: 0, takebacks: true, hints: true, evalBar: false, customElo: 1200 };

export function hasSavedSetup(): boolean {
  try {
    return localStorage.getItem(LS_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadSetup(): Setup {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') };
  } catch {
    return DEFAULT;
  }
}

export function saveSetup(s: Setup) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function setupBot(s: Setup): BotProfile {
  return s.botId.startsWith('custom') ? customBot(s.customElo) : (findBot(s.botId) ?? BOTS[5]);
}

/** The roster bot closest to a rating. */
export function suggestedBot(rating: number): BotProfile {
  return BOTS.reduce((best, b) => (Math.abs(b.elo - rating) < Math.abs(best.elo - rating) ? b : best), BOTS[0]);
}

/** Starts a game against the setup's bot and opens the board. */
export function startBotGame(s: Setup, startFen = START_FEN) {
  const userColor: Color = s.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : s.color;
  useLiveGame.getState().start({
    botId: setupBot(s).id,
    userColor,
    startFen,
    timeControl: TIME_CONTROLS[s.tc]?.tc ?? null,
    takebacks: s.takebacks,
    hints: s.hints,
    evalBar: s.evalBar,
  });
  playSound('start');
  navigate('/game');
}
