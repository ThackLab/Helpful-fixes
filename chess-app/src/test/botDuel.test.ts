// Reviews games between two bot ratings and reports each side's errors. Run with:
//   BOT_DUEL="1150:1450;4" npx vitest run src/test/botDuel.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { reviewGame } from '../lib/review/review';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.BOT_DUEL)('bot duel', { timeout: 6 * 3_600_000 }, async () => {
  const [pair, gamesArg] = process.env.BOT_DUEL!.split(';');
  const [a, b] = pair.split(':').map(Number);
  const games = +(gamesArg ?? 4);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  let next = 0;
  const out: string[] = [];
  const worker = async () => {
    const bot = nodeEngine();
    const ana = nodeEngine({ Hash: 32 });
    while (next < games) {
      const g = next++;
      const aWhite = g % 2 === 0;
      const chess = new Chess();
      const moves: string[] = [];
      const sources: string[] = [];
      while (!chess.isGameOver() && moves.length < 240) {
        const isA = (chess.turn() === 'w') === aWhite;
        const mv = await chooseBotMove(bot, { startFen: new Chess().fen(), moves, bot: customBot(isA ? a : b), book });
        chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
        moves.push(mv.uci);
        sources.push(mv.source);
      }
      const review = await reviewGame({ startFen: new Chess().fen(), moves: moves.slice(0, 120) }, { engines: [ana], depth: 12, book });
      const lines = [
        `GAME ${g + 1}: ${aWhite ? a : b} (W) v ${aWhite ? b : a} (B) result ${chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : 'draw/unfinished'} in ${moves.length} plies`,
      ];
      for (const m of review.moves) {
        if (m.cpLoss < 150 || m.epBefore < 0.25 || m.epBefore > 0.75) continue;
        const who = (m.color === 'w') === aWhite ? a : b;
        lines.push(
          `  ${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '...'} ${m.san} by ${who} [${sources[m.ply]}] loses ${m.cpLoss}cp (best ${m.bestSan})`,
        );
      }
      out.push(lines.join('\n'));
    }
    bot.terminate();
    ana.terminate();
  };
  await Promise.all(Array.from({ length: Math.min(4, games) }, worker));
  process.stdout.write('\n' + out.join('\n') + '\n');
});
