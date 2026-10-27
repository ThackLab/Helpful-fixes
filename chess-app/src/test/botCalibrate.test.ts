// Measures how human-like the bots are: plays self-play games at each rating
// and reviews them with the app's own classifier. Run with:
//   BOT_CAL="250,550,850,1150,1450;6" npx vitest run src/test/botCalibrate.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { reviewGame } from '../lib/review/review';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.BOT_CAL)('bot calibration', { timeout: 6 * 3_600_000 }, async () => {
  const [elosArg, gamesArg] = process.env.BOT_CAL!.split(';');
  const elos = elosArg.split(',').map(Number);
  const games = +(gamesArg ?? 4);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const jobs = elos.flatMap((elo) => Array.from({ length: games }, () => elo));
  const stats = new Map<
    number,
    {
      sides: number;
      moves: number;
      blunder: number;
      mistake: number;
      inaccuracy: number;
      acc: number;
      decisive: number;
      bal: number;
      drops: number;
      errs: number;
      cpl: number;
      misses: number;
    }
  >();
  let next = 0;
  const worker = async () => {
    const bot = nodeEngine();
    const ana = nodeEngine({ Hash: 32 });
    while (next < jobs.length) {
      const elo = jobs[next++];
      const chess = new Chess();
      const moves: string[] = [];
      while (!chess.isGameOver() && moves.length < 200) {
        const mv = await chooseBotMove(bot, { startFen: new Chess().fen(), moves, bot: customBot(elo), book });
        chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
        moves.push(mv.uci);
      }
      // Only the first 60 moves of each side count, like a typical game.
      const counted = moves.slice(0, 120);
      const review = await reviewGame({ startFen: new Chess().fen(), moves: counted }, { engines: [ana], depth: 12, book });
      const s = stats.get(elo) ?? {
        sides: 0,
        moves: 0,
        blunder: 0,
        mistake: 0,
        inaccuracy: 0,
        acc: 0,
        decisive: 0,
        bal: 0,
        drops: 0,
        errs: 0,
        cpl: 0,
        misses: 0,
      };
      // Errors in still-balanced positions (once a game is decided, the classifier barely reacts).
      for (const m of review.moves) {
        if (m.ply < 8 || m.epBefore < 0.3 || m.epBefore > 0.7) continue;
        s.bal++;
        s.cpl += Math.min(1000, Math.max(0, m.cpLoss));
        // A big loss where the best move was a capture is a missed win, not a piece given away.
        if (m.cpLoss >= 250 && m.bestSan?.includes('x')) s.misses++;
        else if (m.cpLoss >= 250) s.drops++;
        else if (m.cpLoss >= 100) s.errs++;
      }
      for (const side of [review.white, review.black]) {
        s.sides++;
        s.blunder += side.counts.blunder ?? 0;
        s.mistake += (side.counts.mistake ?? 0) + (side.counts.miss ?? 0);
        s.inaccuracy += side.counts.inaccuracy ?? 0;
        s.acc += side.accuracy;
      }
      s.moves += counted.length;
      if (chess.isCheckmate()) s.decisive++;
      stats.set(elo, s);
      process.stdout.write(`\n${elo}: game of ${moves.length} plies${chess.isCheckmate() ? ' (mate)' : ''}`);
    }
    bot.terminate();
    ana.terminate();
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  const rows = [...stats.entries()].sort((a, b) => a[0] - b[0]);
  process.stdout.write(
    '\n\nElo   acc%  blunders  mistakes  inaccuracies  plies/game | balanced positions: moves  ACPL  gives-away>=250cp%  errors 100-249cp%  missed-captures%\n',
  );
  for (const [elo, s] of rows) {
    const per = (x: number) => (x / s.sides).toFixed(1).padStart(8);
    process.stdout.write(
      `${String(elo).padEnd(5)} ${(s.acc / s.sides).toFixed(1).padStart(5)} ${per(s.blunder)}  ${per(s.mistake)}  ${per(s.inaccuracy)}  ${(s.moves / (s.sides / 2)).toFixed(0).padStart(8)}   | ${String(s.bal).padStart(6)} ${(s.cpl / Math.max(1, s.bal)).toFixed(0).padStart(5)} ${((100 * s.drops) / Math.max(1, s.bal)).toFixed(1).padStart(8)} ${((100 * s.errs) / Math.max(1, s.bal)).toFixed(1).padStart(10)} ${((100 * s.misses) / Math.max(1, s.bal)).toFixed(1).padStart(12)}\n`,
    );
  }
});
