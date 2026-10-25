// Head-to-head matches between bot ratings, run in parallel. Run with:
//   BOT_LADDER="850:1150,1450:1500;8" npx vitest run src/test/botLadder.test.ts --silent=false
// Each pair plays the given number of games with alternating colours.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.BOT_LADDER)('bot ladder', { timeout: 6 * 3_600_000 }, async () => {
  const [pairsArg, gamesArg] = process.env.BOT_LADDER!.split(';');
  const pairs = pairsArg.split(',').map((p) => p.split(':').map(Number) as [number, number]);
  const games = +(gamesArg ?? 8);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const jobs = pairs.flatMap(([a, b]) => Array.from({ length: games }, (_, g) => ({ a, b, aWhite: g % 2 === 0 })));
  const score = new Map<string, { a: number; n: number }>();
  let next = 0;
  const worker = async () => {
    const engine = nodeEngine();
    while (next < jobs.length) {
      const { a, b, aWhite } = jobs[next++];
      const chess = new Chess();
      const moves: string[] = [];
      while (!chess.isGameOver() && moves.length < 300) {
        const isA = (chess.turn() === 'w') === aWhite;
        const mv = await chooseBotMove(engine, { startFen: new Chess().fen(), moves, bot: customBot(isA ? a : b), book });
        chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
        moves.push(mv.uci);
      }
      let white = 0.5;
      if (chess.isCheckmate()) white = chess.turn() === 'w' ? 0 : 1;
      const aScore = aWhite ? white : 1 - white;
      const key = `${a}:${b}`;
      const s = score.get(key) ?? { a: 0, n: 0 };
      s.a += aScore;
      s.n++;
      score.set(key, s);
      process.stdout.write(`\n${key} game ${s.n}: ${aScore === 1 ? a : aScore === 0 ? b : 'draw'} (${moves.length} plies)`);
    }
    engine.terminate();
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  process.stdout.write('\n\npair        score     implied Elo gap (expected gap)\n');
  for (const [a, b] of pairs) {
    const s = score.get(`${a}:${b}`)!;
    const p = Math.min(0.97, Math.max(0.03, s.a / s.n));
    const gap = Math.round(-400 * Math.log10(1 / p - 1));
    process.stdout.write(`${`${a} v ${b}`.padEnd(11)} ${`${s.a}/${s.n}`.padEnd(9)} ${String(gap).padStart(5)} (${a - b})\n`);
  }
});
