// Prints Stockfish's top lines for positions listed in a JSON file. Run with:
//   PROBE=path/to/fens.json npx vitest run src/test/probe.test.ts --silent=false
// The file holds an array of FEN strings, [fen, depth] pairs, or { fen, moves }
// objects, which also print how good each of the listed moves is. Scores are
// from White's point of view.
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { sanLine, validateFen } from '../lib/chess/utils';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.PROBE)('probe', { timeout: 3_600_000 }, async () => {
  type Item = string | [string, number] | { fen: string; moves: string[]; depth?: number };
  const items: Item[] = JSON.parse(readFileSync(process.env.PROBE!, 'utf8'));
  const engines = [nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 })];
  const out: string[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    engines.map(async (e) => {
      while (next < items.length) {
        const i = next++;
        const item = items[i];
        const [fen, depth] = typeof item === 'string' ? [item, 18] : Array.isArray(item) ? item : [item.fen, item.depth ?? 18];
        const err = validateFen(fen);
        if (err) {
          out[i] = `#${i} INVALID ${fen}: ${err}`;
          continue;
        }
        const r = await e.analyse({ fen, limits: { depth }, multipv: 3 });
        const side = new Chess(fen).turn();
        out[i] =
          `#${i} ${fen} (${side} to move)\n` +
          r.lines
            .map((l) => {
              const s = l.score.type === 'mate' ? `#${l.score.value}` : (l.score.value / 100).toFixed(2);
              return `    ${s.padStart(6)}  ${sanLine(fen, l.pv, 9).join(' ')}`;
            })
            .join('\n');
        if (typeof item === 'object' && !Array.isArray(item)) {
          for (const uci of item.moves) {
            const c = new Chess(fen);
            const san = sanLine(fen, [uci], 1)[0];
            if (!san) {
              out[i] += `\n    ILLEGAL ${uci}`;
              continue;
            }
            c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
            const after = c.fen();
            const r2 = c.isGameOver() ? null : await e.analyse({ fen: after, limits: { depth: depth - 1 }, multipv: 1 });
            const l = r2?.lines[0];
            const s = !l ? (c.isCheckmate() ? 'mate' : 'draw') : l.score.type === 'mate' ? `#${l.score.value}` : (l.score.value / 100).toFixed(2);
            out[i] += `\n    ${san.padEnd(7)} -> ${s.padStart(6)}  ${l ? sanLine(after, l.pv, 6).join(' ') : ''}`;
          }
        }
      }
    }),
  );
  process.stdout.write('\n' + out.join('\n') + '\n');
  engines.forEach((e) => e.terminate());
});
