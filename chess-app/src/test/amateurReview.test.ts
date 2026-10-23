// Generates a game between two weak bots and prints its review - a realistic
// sample of amateur mistakes for eyeballing the coach's explanations.
// Run with: AMATEUR=1 npx vitest run src/test/amateurReview.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { reviewGame } from '../lib/review/review';
import { CLASS_META } from '../lib/review/types';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.AMATEUR)('amateur game review', { timeout: 900_000 }, async () => {
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const elo = +(process.env.ELO ?? 800);
  const bot = nodeEngine();
  const chess = new Chess();
  const moves: string[] = [];
  let seed = +(process.env.SEED ?? 7);
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 10; i++) rng(); // small seeds start with tiny values
  while (!chess.isGameOver() && moves.length < 120) {
    const mv = await chooseBotMove(bot, { startFen: new Chess().fen(), moves, bot: customBot(elo), book, rng });
    chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
    moves.push(mv.uci);
  }
  bot.terminate();
  const engines = Array.from({ length: 4 }, () => nodeEngine({ Hash: 32 }));
  const review = await reviewGame({ startFen: new Chess().fen(), moves }, { engines, depth: 14, book, userColor: 'w' });
  engines.forEach((e) => e.terminate());
  console.log(chess.pgn());
  for (const m of review.moves) {
    if (['best', 'excellent', 'good', 'book', 'forced'].includes(m.classification)) continue;
    const no = Math.floor(m.ply / 2) + 1 + (m.color === 'w' ? '.' : '...');
    console.log(`${no.padEnd(5)} ${m.san.padEnd(7)} ${CLASS_META[m.classification].label.padEnd(10)} | ${m.comment}`);
  }
  console.log('WHITE', review.white.accuracy.toFixed(1), JSON.stringify(review.white.counts));
  console.log('BLACK', review.black.accuracy.toFixed(1), JSON.stringify(review.black.counts));
  console.log('SUMMARY', review.summary);
});
