// Rates the mined puzzles (data/puzzles-mined.json) by letting the bots try
// them: each puzzle is attempted by bots from 300 to 1900, and its rating is
// the strength at which a bot solves it about half the time (logistic fit,
// with the heuristic rating as a weak prior). Results go to
// data/puzzle-ratings.json, so the run can be stopped, resumed, and run while
// the miner is still adding puzzles. Run with:
//   PUZZLE_RATE="<workers>" npx vitest run src/test/puzzleRate.test.ts --silent=false
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { playUci } from '../lib/chess/utils';
import type { Engine } from '../lib/engine/engine';
import type { TacticPuzzle } from '../lib/learn/puzzles';
import { nodeEngine } from './nodeEngine';

const MINED = fileURLToPath(new URL('../../data/puzzles-mined.json', import.meta.url));
export const RATINGS = fileURLToPath(new URL('../../data/puzzle-ratings.json', import.meta.url));
const LEVELS = [300, 600, 900, 1200, 1450, 1900];
const TRIES = 2;

/** One attempt: the bot plays the solver's moves, the replies come from the solution. */
async function attempt(engine: Engine, p: TacticPuzzle, elo: number): Promise<boolean> {
  const start = new Chess(p.fen);
  playUci(start, p.moves[0]);
  const startFen = start.fen();
  const line = p.moves.slice(1);
  const played: string[] = [];
  for (let i = 0; i < line.length; i += 2) {
    const mv = await chooseBotMove(engine, { startFen, moves: played, bot: customBot(elo) });
    const c = new Chess(startFen);
    for (const u of played) playUci(c, u);
    playUci(c, mv.uci);
    if (c.isCheckmate()) return true;
    if (mv.uci !== line[i]) return false;
    played.push(line[i]);
    if (i + 1 < line.length) played.push(line[i + 1]);
  }
  return true;
}

/** Most likely rating given the results, with a weak prior around the heuristic. */
export function fitRating(results: { elo: number; ok: boolean }[], prior: number): number {
  let best = prior;
  let bestLl = -Infinity;
  for (let r = 100; r <= 2800; r += 10) {
    let ll = -((r - prior) ** 2) / (2 * 450 ** 2);
    for (const { elo, ok } of results) {
      const p = 1 / (1 + Math.pow(10, (r - elo) / 400));
      ll += Math.log(ok ? Math.max(1e-6, p) : Math.max(1e-6, 1 - p));
    }
    if (ll > bestLl) {
      bestLl = ll;
      best = r;
    }
  }
  return Math.round(best / 10) * 10;
}

it.skipIf(!process.env.PUZZLE_RATE)('rate puzzles', { timeout: 24 * 3_600_000 }, async () => {
  const workers = +(process.env.PUZZLE_RATE ?? 3);
  const ratings: Record<string, { rating: number; solved: string }> = existsSync(RATINGS) ? JSON.parse(readFileSync(RATINGS, 'utf8')) : {};
  let done = 0;
  const save = () => {
    writeFileSync(RATINGS + '.tmp', JSON.stringify(ratings));
    renameSync(RATINGS + '.tmp', RATINGS);
  };
  // Picks up puzzles the miner adds while this runs.
  const pending = () => (JSON.parse(readFileSync(MINED, 'utf8')) as TacticPuzzle[]).filter((p) => !ratings[p.id]);
  const claimed = new Set<string>();
  const worker = async () => {
    const engine = nodeEngine();
    for (;;) {
      const p = pending().find((x) => !claimed.has(x.id));
      if (!p) break;
      claimed.add(p.id);
      const results: { elo: number; ok: boolean }[] = [];
      for (const elo of LEVELS) for (let t = 0; t < TRIES; t++) results.push({ elo, ok: await attempt(engine, p, elo) });
      const solved = LEVELS.map((e) => results.filter((r) => r.elo === e && r.ok).length).join('');
      ratings[p.id] = { rating: fitRating(results, p.rating), solved };
      done++;
      process.stdout.write(`\n${done} ${p.id} [${p.themes.join(',')}] ${p.rating} -> ${ratings[p.id].rating} (${solved})`);
      if (done % 10 === 0) save();
    }
    engine.terminate();
  };
  await Promise.all(Array.from({ length: workers }, worker));
  save();
  console.log(`\nDONE: rated ${done}, ${Object.keys(ratings).length} in total`);
});
