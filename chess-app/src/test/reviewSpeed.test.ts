// Compares the two-pass review (quick pass, then full depth where it matters)
// with a full-depth review of every position: time taken, and how many moves
// end up with a different classification. Plays a few bot games to review.
// Run with: REVIEW_SPEED="<games>" npx vitest run src/test/reviewSpeed.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { reviewGame } from '../lib/review/review';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.REVIEW_SPEED)('review speed and agreement', { timeout: 6 * 3_600_000 }, async () => {
  const games = +(process.env.REVIEW_SPEED ?? 3);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const bot = nodeEngine();
  const engines = [nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 })];
  let total = { full: 0, quick: 0, moves: 0, differ: 0, bigDiffer: 0, accDiff: 0 };
  const big = new Set(['blunder', 'mistake', 'miss', 'brilliant', 'great']);
  for (let g = 0; g < games; g++) {
    const chess = new Chess();
    const moves: string[] = [];
    const elos = [400 + g * 300, 600 + g * 300];
    while (!chess.isGameOver() && moves.length < 90) {
      const mv = await chooseBotMove(bot, { startFen: chess.fen(), moves: [], bot: customBot(elos[moves.length % 2]), book });
      chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
      moves.push(mv.uci);
    }
    const input = { startFen: new Chess().fen(), moves };
    for (const e of engines) await e.analyse({ fen: input.startFen, limits: { depth: 1 } });
    let t = Date.now();
    const full = await reviewGame(input, { engines, depth: 16, book, maxTimeMs: 6000 });
    const tFull = Date.now() - t;
    // Fresh hash tables, so the second review can't reuse the first one's search.
    for (const e of engines) await e.newGame();
    t = Date.now();
    const quick = await reviewGame(input, { engines, depth: 16, quickDepth: 12, book, maxTimeMs: 6000 });
    const tQuick = Date.now() - t;
    let differ = 0;
    let bigDiffer = 0;
    full.moves.forEach((m, i) => {
      const q = quick.moves[i];
      if (m.classification !== q.classification) {
        differ++;
        if (big.has(m.classification) || big.has(q.classification)) bigDiffer++;
      }
    });
    const accDiff = Math.abs(full.white.accuracy - quick.white.accuracy) + Math.abs(full.black.accuracy - quick.black.accuracy);
    total = {
      full: total.full + tFull,
      quick: total.quick + tQuick,
      moves: total.moves + moves.length,
      differ: total.differ + differ,
      bigDiffer: total.bigDiffer + bigDiffer,
      accDiff: total.accDiff + accDiff / 2,
    };
    process.stdout.write(
      `\ngame ${g + 1}: ${moves.length} plies, full ${(tFull / 1000).toFixed(1)}s, two-pass ${(tQuick / 1000).toFixed(1)}s, ${differ} classes differ (${bigDiffer} involving blunder/mistake/miss/great/brilliant), accuracy diff ${(accDiff / 2).toFixed(1)}`,
    );
  }
  process.stdout.write(
    `\n\nTOTAL: full ${(total.full / 1000).toFixed(0)}s, two-pass ${(total.quick / 1000).toFixed(0)}s (${((1 - total.quick / total.full) * 100).toFixed(0)}% faster); ${total.differ}/${total.moves} classes differ, ${total.bigDiffer} big; mean accuracy diff ${(total.accDiff / games).toFixed(2)}\n`,
  );
  bot.terminate();
  engines.forEach((e) => e.terminate());
});
