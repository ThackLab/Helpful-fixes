// Turns classic tactics collections and real-game positions (data/sources)
// into puzzles: Win at Chess, positions from the Encyclopedia of Chess
// Middlegames, positions from real Lichess games, and mate-in-N problems.
// Each position is checked with Stockfish: the book move (when there is one)
// must be the engine's choice, it must be the only move that wins, and the
// line is followed for as long as the solver's move stays the only one. Run:
//   PUZZLE_IMPORT="<workers>" npx vitest run src/test/puzzleImport.test.ts --silent=false
// Results go to data/puzzles-real.json; rate them with puzzleRate.test.ts.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { lineMaterial } from '../lib/chess/tactics';
import { playUci, sanLine, validateFen } from '../lib/chess/utils';
import { tagPuzzle } from '../lib/learn/tags';
import { puzzleRating, type TacticPuzzle } from '../lib/learn/puzzles';
import { nodeEngine } from './nodeEngine';
import { cpFor, ep, isMateFor, solve, uniqueBest } from './puzzleTools';

const SRC = fileURLToPath(new URL('../../data/sources/', import.meta.url));
const dir = process.env.PUZZLE_DIR ?? fileURLToPath(new URL('../../data', import.meta.url));
const OUT = `${dir}/puzzles-real.json`;

interface Item {
  id: string;
  fen: string;
  /** Book solutions (SAN), if the collection gives them. */
  bm?: string[];
  /** Mate problems: the number of moves to mate. */
  mateIn?: number;
  source: string;
}

function readEpd(file: string, prefix: string, label: (id: string, n: number) => string): Item[] {
  return readFileSync(SRC + file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l, n) => {
      const fields = l.trim().split(/\s+/);
      const fen = `${fields.slice(0, 4).join(' ')} 0 1`;
      const ops = fields.slice(4).join(' ');
      const bm = /\bbm ([^;]+);/.exec(ops)?.[1].trim().split(/\s+/);
      const id = /\bid "([^"]+)"/.exec(ops)?.[1] ?? `${n + 1}`;
      return { id: `${prefix}${n + 1}`, fen, bm, source: label(id, n + 1) };
    });
}

function readFens(file: string, prefix: string, mateIn: number): Item[] {
  return readFileSync(SRC + file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, n) => ({ id: `${prefix}${n + 1}`, fen: l.trim(), mateIn, source: `Mate in ${mateIn} problem` }));
}

const clean = (san: string) => san.replace(/[+#!?]/g, '');

it.skipIf(!process.env.PUZZLE_IMPORT)('import puzzle collections', { timeout: 24 * 3_600_000 }, async () => {
  const workers = +(process.env.PUZZLE_IMPORT ?? 3);
  const items: Item[] = [
    ...readEpd('win_at_chess_test.epd', 'wac', (_, n) => `Win at Chess #${n}`),
    ...readEpd('ecmgcp.epd', 'ecm', () => 'Encyclopedia of Chess Middlegames'),
    ...readEpd('lichess_blunders.epd', 'lg', () => 'Lichess game'),
    ...readFens('mate1.fen', 'm1-', 1),
    ...readFens('mate2.fen', 'm2-', 2),
    ...readFens('mate3.fen', 'm3-', 3),
    ...readFens('mate4.fen', 'm4-', 4),
  ];
  const out: TacticPuzzle[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const done = new Set<string>(out.map((p) => p.id));
  const rejected = new Map<string, number>();
  const reject = (why: string) => rejected.set(why, (rejected.get(why) ?? 0) + 1);
  const todo = items.filter((i) => !done.has(i.id));
  let next = 0;
  let checked = 0;
  const save = () => {
    writeFileSync(OUT + '.tmp', JSON.stringify(out));
    renameSync(OUT + '.tmp', OUT);
  };
  const worker = async () => {
    const ana = nodeEngine({ Hash: 64 });
    while (next < todo.length) {
      const it = todo[next++];
      checked++;
      if (validateFen(it.fen)) {
        reject('invalid');
        continue;
      }
      const chess = new Chess(it.fen);
      if (chess.isGameOver()) {
        reject('over');
        continue;
      }
      const solver = chess.turn();
      const r = await ana.analyse({ fen: it.fen, limits: { depth: 18, movetime: 5000 }, multipv: 2 });
      const best = r.lines[0];
      if (!best?.pv.length) {
        reject('no line');
        continue;
      }
      const bestSan = sanLine(it.fen, [best.pv[0]])[0] ?? '';
      if (it.bm && !it.bm.some((b) => clean(b) === clean(bestSan))) {
        reject('book move differs');
        continue;
      }
      if (!uniqueBest(r.lines, solver)) {
        reject('not unique');
        continue;
      }
      if (ep(best, solver) < 0.7) {
        reject('not winning');
        continue;
      }
      let line: string[] | null;
      if (isMateFor(best, solver) && best.score.type === 'mate' && best.score.value !== 0 && Math.abs(best.score.value) <= 4) {
        // A forced mate: the engine's mating line is the solution (any mate on the last move counts).
        const n = Math.abs(best.score.value);
        if (it.mateIn && n !== it.mateIn) {
          reject('mate length differs');
          continue;
        }
        line = best.pv.slice(0, 2 * n - 1);
        const end = new Chess(it.fen);
        for (const u of line) playUci(end, u);
        if (!end.isCheckmate()) {
          reject('mate line incomplete');
          continue;
        }
      } else {
        if (it.mateIn) {
          reject('no mate found');
          continue;
        }
        line = await solve(ana, it.fen, solver, r.lines);
        if (!line) {
          reject('no line');
          continue;
        }
        const gain = lineMaterial(it.fen, line, solver, 12).delta;
        // Collections of tactics may win by a big positional or mating advantage; real-game positions must win material.
        if (gain < 2 && !(it.id.startsWith('wac') && cpFor(best, solver) >= 300)) {
          reject('no material won');
          continue;
        }
      }
      const themes = tagPuzzle(it.fen, line);
      const p: TacticPuzzle = { id: it.id, fen: it.fen, moves: line, themes, rating: 0, noPrev: true, source: it.source };
      p.rating = puzzleRating(p);
      out.push(p);
      if (out.length % 10 === 0) save();
      process.stdout.write(`\n${checked}/${todo.length} +${it.id} [${themes.join(',')}] ${sanLine(it.fen, line).join(' ')}`);
    }
    ana.terminate();
  };
  await Promise.all(Array.from({ length: workers }, worker));
  save();
  process.stdout.write(`\nDONE: ${out.length} puzzles; rejected ${JSON.stringify(Object.fromEntries(rejected))}\n`);
});
