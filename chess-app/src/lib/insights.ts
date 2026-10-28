// Patterns across all your reviewed games: where the points go, the mistakes
// that keep coming back, whether winning positions get won, time trouble,
// openings, and this month against the last. Pure functions over stored data.
import type { Color } from 'chess.js';
import { gameLessons } from './review/lessons';
import type { GameReview, Phase } from './review/types';
import type { GameRecord } from './storage/db';
import { LESSON_FOR_THEME } from './learn/curriculum';

export interface ReviewedGame {
  game: GameRecord;
  review: GameReview;
  color: Color;
}

export interface Pattern {
  key: string;
  title: string;
  rule: string;
  /** Games in which it came up. */
  games: number;
  /** Expected points lost to it, per game it came up in. */
  costPerGame: number;
  /** Share of all the points lost to recognised patterns. */
  share: number;
  lesson?: string;
}

export interface PeriodStats {
  games: number;
  accuracy: number | null;
  blunders: number | null;
  score: number | null;
}

export interface Insights {
  games: number;
  accuracies: number[];
  /** Average expected points lost per game in each phase. */
  phases: Record<Phase, number>;
  patterns: Pattern[];
  /** Games where you reached a winning position (88%+), and how they ended. */
  conversion: { winning: number; won: number; drawn: number; lost: number };
  /** Games where you were clearly losing (12% or less), and how many you saved. */
  comebacks: { losing: number; saved: number };
  /** Serious mistakes in timed games, and how many came with little time left. */
  time: { games: number; mistakes: number; inTrouble: number } | null;
  openings: { name: string; color: Color; games: number; score: number }[];
  thisMonth: PeriodStats;
  lastMonth: PeriodStats;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** 1 for a win, 0.5 for a draw, 0 for a loss, from your side. */
function scoreFor(g: GameRecord, color: Color): number | null {
  if (g.result === '1/2-1/2') return 0.5;
  if (g.result === '1-0') return color === 'w' ? 1 : 0;
  if (g.result === '0-1') return color === 'b' ? 1 : 0;
  return null;
}

const initialMsOf = (g: GameRecord) => {
  const tc = g.timeControl?.match(/^(\d+(?:\.\d+)?)\+/);
  return tc ? +tc[1] * 60_000 : undefined;
};

function period(list: ReviewedGame[]): PeriodStats {
  const scores = list.map((x) => scoreFor(x.game, x.color)).filter((s): s is number => s !== null);
  return {
    games: list.length,
    accuracy: avg(list.map((x) => x.review[x.color === 'w' ? 'white' : 'black'].accuracy)),
    blunders: avg(list.map((x) => x.review[x.color === 'w' ? 'white' : 'black'].counts.blunder)),
    score: avg(scores),
  };
}

/** The opening family: "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
const family = (name: string) => name.split(':')[0].trim();

export function computeInsights(all: ReviewedGame[], now = Date.now()): Insights {
  const list = [...all].sort((a, b) => a.game.createdAt - b.game.createdAt);
  const phases: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  const patternCost = new Map<string, { title: string; rule: string; cost: number; games: number }>();
  const conversion = { winning: 0, won: 0, drawn: 0, lost: 0 };
  const comebacks = { losing: 0, saved: 0 };
  let timedGames = 0;
  let timedMistakes = 0;
  let inTrouble = 0;
  const openings = new Map<string, { name: string; color: Color; games: number; points: number }>();

  for (const { game, review, color } of list) {
    const mine = review.moves.filter((m) => m.color === color);
    for (const m of mine) phases[m.phase] += m.epLoss;

    const clocks = game.clocks;
    const initialMs = initialMsOf(game);
    const lessons = gameLessons(review, { userColor: color, result: game.result, clocks, initialMs });
    for (const l of lessons.lessons) {
      if (l.theme === 'positional') continue;
      const cur = patternCost.get(l.theme) ?? { title: l.title, rule: l.rule, cost: 0, games: 0 };
      cur.cost += l.cost;
      cur.games += 1;
      patternCost.set(l.theme, cur);
    }

    const score = scoreFor(game, color);
    if (score !== null) {
      if (mine.some((m) => m.epBefore >= 0.88)) {
        conversion.winning++;
        if (score === 1) conversion.won++;
        else if (score === 0.5) conversion.drawn++;
        else conversion.lost++;
      }
      if (mine.some((m) => m.epBefore <= 0.12)) {
        comebacks.losing++;
        if (score > 0) comebacks.saved++;
      }
    }

    if (clocks?.length && initialMs) {
      timedGames++;
      const low = Math.max(30_000, initialMs * 0.1);
      for (const m of mine) {
        if (m.classification !== 'blunder' && m.classification !== 'mistake') continue;
        timedMistakes++;
        if ((clocks[m.ply - 2] ?? initialMs) < low) inTrouble++;
      }
    }

    const name = review.opening?.name ?? game.opening;
    if (name && score !== null) {
      const key = `${color}:${family(name)}`;
      const cur = openings.get(key) ?? { name: family(name), color, games: 0, points: 0 };
      cur.games++;
      cur.points += score;
      openings.set(key, cur);
    }
  }

  const n = Math.max(1, list.length);
  for (const k of Object.keys(phases) as Phase[]) phases[k] /= n;
  const totalCost = [...patternCost.values()].reduce((a, p) => a + p.cost, 0) || 1;
  const patterns: Pattern[] = [...patternCost.entries()]
    .map(([key, p]) => ({
      key,
      title: p.title,
      rule: p.rule,
      games: p.games,
      costPerGame: p.cost / p.games,
      share: p.cost / totalCost,
      lesson: LESSON_FOR_THEME[key],
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);

  const month = (offset: number) => {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth() - offset, 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() - offset + 1, 1).getTime();
    return list.filter((x) => x.game.createdAt >= start && x.game.createdAt < end);
  };

  return {
    games: list.length,
    accuracies: list.map((x) => x.review[x.color === 'w' ? 'white' : 'black'].accuracy),
    phases,
    patterns,
    conversion,
    comebacks,
    time: timedGames ? { games: timedGames, mistakes: timedMistakes, inTrouble } : null,
    openings: [...openings.values()]
      .filter((o) => o.games >= 2)
      .sort((a, b) => b.games - a.games)
      .slice(0, 6)
      .map((o) => ({ name: o.name, color: o.color, games: o.games, score: o.points / o.games })),
    thisMonth: period(month(0)),
    lastMonth: period(month(1)),
  };
}
