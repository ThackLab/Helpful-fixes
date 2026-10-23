// Prints Stockfish's top lines for positions listed in a JSON file. Run with:
//   PROBE=path/to/fens.json npx vitest run src/test/probe.test.ts --silent=false
// The file holds an array of FEN strings (or [fen, depth] pairs).
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { sanLine, validateFen } from '../lib/chess/utils';
import { nodeEngine } from './nodeEngine';

it.skipIf(!process.env.PROBE)('probe', { timeout: 3_600_000 }, async () => {
  const items: (string | [string, number])[] = JSON.parse(readFileSync(process.env.PROBE!, 'utf8'));
  const engines = [nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 }), nodeEngine({ Hash: 32 })];
  const out: string[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    engines.map(async (e) => {
      while (next < items.length) {
        const i = next++;
        const [fen, depth] = typeof items[i] === 'string' ? [items[i] as string, 18] : (items[i] as [string, number]);
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
      }
    }),
  );
  process.stdout.write('\n' + out.join('\n') + '\n');
  engines.forEach((e) => e.terminate());
});
