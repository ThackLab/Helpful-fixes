// Measures what the background analysis during a game buys the review after
// it. Plays a few bot games; for each one, a separate single engine analyses
// every position newest first at the review depth (what src/state/liveAnalysis.ts
// does while you play), then the review runs with those evaluations cached.
// Each review (from scratch, from scratch again, and from the cache) is
// compared with a review 4 plies deeper: how many moves it classifies
// differently, and how far its accuracy scores are off.
// Run with: REVIEW_SPEED="<games>" npx vitest run src/test/reviewSpeed.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { sanLine } from '../lib/chess/utils';
import { reviewGame, type ReviewOptions } from '../lib/review/review';
import type { PositionEval } from '../lib/review/types';
import { nodeEngine } from './nodeEngine';

const DEPTH = 16;
const MULTIPV = 3;

it.skipIf(!process.env.REVIEW_SPEED)('review speed and agreement', { timeout: 6 * 3_600_000 }, async () => {
  const games = +(process.env.REVIEW_SPEED ?? 3);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const bot = nodeEngine();
  const live = nodeEngine({ Hash: 32 });
  const engines = [nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 })];
  const totals: Record<string, { ms: number; differ: number; big: number; acc: number }> = {};
  let fullMs = 0;
  let liveMs = 0;
  let plies = 0;
  const big = new Set(['blunder', 'mistake', 'miss', 'brilliant', 'great']);
  for (let g = 0; g < games; g++) {
    const chess = new Chess();
    const moves: string[] = [];
    const fens = [chess.fen()];
    const elos = [400 + g * 300, 600 + g * 300];
    while (!chess.isGameOver() && moves.length < 90) {
      const mv = await chooseBotMove(bot, { startFen: chess.fen(), moves: [], bot: customBot(elos[moves.length % 2]), book });
      chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] });
      moves.push(mv.uci);
      fens.push(chess.fen());
    }
    const input = { startFen: fens[0], moves };

    // The background analysis, newest position first.
    const cached = new Map<string, PositionEval>();
    await live.newGame();
    let t = Date.now();
    for (let i = fens.length - 1; i >= 0; i--) {
      if (new Chess(fens[i]).isGameOver()) continue;
      const r = await live.analyse({ fen: fens[i], limits: { depth: DEPTH, movetime: 8000 }, multipv: MULTIPV });
      if (r.depth >= DEPTH)
        cached.set(fens[i], {
          fen: fens[i],
          depth: r.depth,
          lines: r.lines.filter((l) => l.pv.length).map((l) => ({ score: l.score, pv: l.pv, san: sanLine(fens[i], l.pv, 12), depth: l.depth })),
        });
    }
    liveMs += Date.now() - t;

    for (const e of engines) await e.analyse({ fen: input.startFen, limits: { depth: 1 } });
    let searched = 0;
    const run = async (extra: Partial<ReviewOptions>) => {
      // Fresh hash tables, so no review can reuse another one's search.
      for (const e of engines) await e.newGame();
      searched = 0;
      t = Date.now();
      const r = await reviewGame(input, { engines, depth: DEPTH, book, maxTimeMs: 6000, onPosition: () => searched++, ...extra });
      return { r, ms: Date.now() - t };
    };
    // A much deeper review to measure each one against.
    const reference = (await run({ depth: DEPTH + 4, maxTimeMs: 30000 })).r;
    const base = await run({});
    const variants = {
      scratch: base,
      again: await run({}),
      cached: await run({
        cache: { get: async (fen, d, m) => (m <= MULTIPV && (cached.get(fen)?.depth ?? 0) >= d ? cached.get(fen)! : null), put: async () => {} },
      }),
    };
    let line = `\ngame ${g + 1}: ${moves.length} plies, full ${(base.ms / 1000).toFixed(1)}s, cached review searched ${searched} positions`;
    for (const [name, v] of Object.entries(variants)) {
      let differ = 0;
      let bigDiffer = 0;
      reference.moves.forEach((m, i) => {
        const q = v.r.moves[i];
        if (m.classification !== q.classification) {
          differ++;
          if (big.has(m.classification) || big.has(q.classification)) bigDiffer++;
        }
      });
      const accDiff = (Math.abs(reference.white.accuracy - v.r.white.accuracy) + Math.abs(reference.black.accuracy - v.r.black.accuracy)) / 2;
      const tot = (totals[name] ??= { ms: 0, differ: 0, big: 0, acc: 0 });
      tot.ms += v.ms;
      tot.differ += differ;
      tot.big += bigDiffer;
      tot.acc += accDiff;
      line += ` | ${name} ${(v.ms / 1000).toFixed(1)}s, ${differ} differ from deep (${bigDiffer} big), acc ${accDiff.toFixed(1)}`;
    }
    fullMs += base.ms;
    plies += moves.length;
    process.stdout.write(line);
  }
  process.stdout.write(
    `\n\nTOTAL over ${plies} moves: review from scratch ${(fullMs / 1000).toFixed(0)}s; background analysis took ${(liveMs / 1000).toFixed(0)}s on one thread (${(liveMs / plies / 1000).toFixed(1)}s a move)`,
  );
  for (const [name, tot] of Object.entries(totals))
    process.stdout.write(
      `\n  ${name}: ${(tot.ms / 1000).toFixed(1)}s, ${tot.differ} classes differ from the deep review, ${tot.big} big, mean accuracy diff ${(tot.acc / games).toFixed(2)}`,
    );
  process.stdout.write('\n');
  bot.terminate();
  live.terminate();
  engines.forEach((e) => e.terminate());
});
