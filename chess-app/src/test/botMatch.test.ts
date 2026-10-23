// Bot-vs-bot matches for strength calibration. Run with:
//   BOT_MATCH="1000,1300,6" npx vitest run src/test/botMatch.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.BOT_MATCH)('bot match', { timeout: 3_600_000 }, async () => {
  const [a, b, n] = process.env.BOT_MATCH!.split(',').map(Number);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const engines = [nodeEngine(), nodeEngine()];
  const score = { a: 0, b: 0 };
  let totalMoveMs = 0;
  let moveCount = 0;
  for (let g = 0; g < n; g++) {
    const aWhite = g % 2 === 0;
    const chess = new Chess();
    const moves: string[] = [];
    while (!chess.isGameOver() && moves.length < 300) {
      const whiteToMove = chess.turn() === 'w';
      const isA = whiteToMove === aWhite;
      const t0 = Date.now();
      const mv = await chooseBotMove(engines[isA ? 0 : 1], { startFen: new Chess().fen(), moves, bot: customBot(isA ? a : b), book });
      totalMoveMs += Date.now() - t0;
      moveCount++;
      chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
      moves.push(mv.uci);
    }
    let res = 0.5;
    if (chess.isCheckmate()) res = chess.turn() === 'w' ? 0 : 1; // 1 = white wins
    const aScore = aWhite ? res : 1 - res;
    score.a += aScore;
    score.b += 1 - aScore;
    console.log(
      `game ${g + 1}: ${aWhite ? a : b} (W) vs ${aWhite ? b : a} (B) -> ${res === 1 ? '1-0' : res === 0 ? '0-1' : '1/2'} in ${moves.length} plies`,
    );
  }
  console.log(`RESULT ${a}: ${score.a} - ${b}: ${score.b}   avg move ${(totalMoveMs / moveCount).toFixed(0)}ms`);
  engines.forEach((e) => e.terminate());
});
