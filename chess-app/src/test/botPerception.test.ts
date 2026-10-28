// How bots react to the two situations that decide club games, measured on
// the puzzle positions where a piece has just been left hanging:
//   punish: the bot can win that piece - does it?
//   save:   the same position with the bot as the side whose piece hangs - does it save it?
// Run with: BOT_SEE="250,500,850;2" npx vitest run src/test/botPerception.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess, type Color } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { playUci } from '../lib/chess/utils';
import type { Engine } from '../lib/engine/engine';
import { scoreToCp } from '../lib/engine/uci';
import type { TacticPuzzle } from '../lib/learn/puzzles';
import { nodeEngine } from './nodeEngine';

const puzzles: TacticPuzzle[] = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/puzzles.json', import.meta.url)), 'utf8'));

/** The position after the blunder, optionally with the blunderer to move again. */
function testPosition(p: TacticPuzzle, flip: boolean): string | null {
  // Classic puzzles start at the puzzle itself, not just after a blunder.
  if (p.noPrev) return null;
  const c = new Chess(p.fen);
  playUci(c, p.moves[0]);
  if (!flip) return c.fen();
  if (c.inCheck()) return null;
  const parts = c.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const f = new Chess(parts.join(' '));
    return f.inCheck() || !f.moves().length ? null : f.fen();
  } catch {
    return null;
  }
}

async function evalFor(ana: Engine, fen: string, color: Color): Promise<number> {
  const r = await ana.analyse({ fen, limits: { depth: 12 }, multipv: 1 });
  const s = r.lines[0]?.score;
  return s ? scoreToCp(s) * (color === 'w' ? 1 : -1) : 0;
}

it.skipIf(!process.env.BOT_SEE)('bot perception', { timeout: 6 * 3_600_000 }, async () => {
  const [elosArg, passesArg] = process.env.BOT_SEE!.split(';');
  const elos = elosArg.split(',').map(Number);
  const passes = +(passesArg ?? 1);
  const jobs: { elo: number; fen: string; kind: 'punish' | 'save' }[] = [];
  for (let pass = 0; pass < passes; pass++)
    for (const elo of elos)
      for (const p of puzzles) {
        const a = testPosition(p, false);
        const b = testPosition(p, true);
        if (a) jobs.push({ elo, fen: a, kind: 'punish' });
        if (b) jobs.push({ elo, fen: b, kind: 'save' });
      }
  const stats = new Map<string, { ok: number; n: number; loss: number }>();
  const best = new Map<string, number>();
  let next = 0;
  const worker = async () => {
    const bot = nodeEngine();
    const ana = nodeEngine({ Hash: 32 });
    while (next < jobs.length) {
      const job = jobs[next++];
      const color = job.fen.split(' ')[1] as Color;
      if (!best.has(job.fen)) best.set(job.fen, await evalFor(ana, job.fen, color));
      const mv = await chooseBotMove(bot, { startFen: job.fen, moves: [], bot: customBot(job.elo) });
      const c = new Chess(job.fen);
      playUci(c, mv.uci);
      const after = c.isCheckmate() ? 10000 : -(await evalFor(ana, c.fen(), c.turn()));
      const loss = Math.max(0, best.get(job.fen)! - after);
      const key = `${job.elo}:${job.kind}`;
      const s = stats.get(key) ?? { ok: 0, n: 0, loss: 0 };
      s.n++;
      if (loss < 150) s.ok++;
      s.loss += Math.min(1000, loss);
      stats.set(key, s);
    }
    bot.terminate();
    ana.terminate();
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  process.stdout.write('\n\nElo   punishes free piece   saves own hanging piece   (n)\n');
  for (const elo of elos) {
    const p = stats.get(`${elo}:punish`)!;
    const s = stats.get(`${elo}:save`)!;
    process.stdout.write(
      `${String(elo).padEnd(5)} ${((100 * p.ok) / p.n).toFixed(0).padStart(10)}%           ${((100 * s.ok) / s.n).toFixed(0).padStart(10)}%          (${p.n}/${s.n})\n`,
    );
  }
});
