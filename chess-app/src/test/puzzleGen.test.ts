// Mines tactics puzzles from engine games. Run with:
//   PUZZLE_GEN="<games>,<workers>" npx vitest run src/test/puzzleGen.test.ts --silent=false
// Each game is played by a sloppy engine (it picks among its top moves at
// random, more loosely in some games than others). At every position, each
// plausible mistake - one of the engine's top 12 moves that throws away 2.5+
// pawns - is tested as a puzzle start: the opponent's reply has to be the only
// move that wins, and stay the only one for every move of the solution. New
// puzzles are added to data/puzzles-mined.json; then rate them with
// puzzleRate.test.ts and build the app's bank with puzzleBank.test.ts.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { setOpeningBook } from '../lib/chess/openings';
import { hangingPieces, lineMaterial } from '../lib/chess/tactics';
import { epd, other, playUci } from '../lib/chess/utils';
import type { PvLine } from '../lib/engine/uci';
import { tagPuzzle, type PuzzleTheme } from '../lib/learn/tags';
import { puzzleRating, type TacticPuzzle } from '../lib/learn/puzzles';
import { nodeEngine } from './nodeEngine';
import { cpFor, ep, isMateFor, solve, uniqueBest } from './puzzleTools';

// PUZZLE_DIR lets a long run write somewhere other than data/ (copy the files back afterwards).
const OUT = process.env.PUZZLE_DIR
  ? `${process.env.PUZZLE_DIR}/puzzles-mined.json`
  : fileURLToPath(new URL('../../data/puzzles-mined.json', import.meta.url));
const PER_GAME = 8;
/** Share of plain captures that still get the deep check (they are already plentiful). */
const SKIP_PLAIN = +(process.env.PUZZLE_PLAIN ?? 0.3);
/** Themes worth keeping every time; plain captures and mates in one are plentiful. */
const RICH: PuzzleTheme[] = [
  'fork',
  'pin',
  'skewer',
  'discovered',
  'doubleCheck',
  'removeDefender',
  'setup',
  'sacrifice',
  'promotion',
  'mateIn2',
  'mateIn3',
  'backRankMate',
  'smotheredMate',
];

function pick<T>(items: { item: T; w: number }[]): T {
  let r = Math.random() * items.reduce((a, b) => a + b.w, 0);
  for (const it of items) if ((r -= it.w) <= 0) return it.item;
  return items[items.length - 1].item;
}

it.skipIf(!process.env.PUZZLE_GEN)('generate puzzles', { timeout: 24 * 3_600_000 }, async () => {
  const [games, workers] = process.env.PUZZLE_GEN!.split(',').map(Number);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const existing: TacticPuzzle[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const seen = new Set(existing.map((p) => epd(p.fen)));
  const found: TacticPuzzle[] = [];
  let started = 0;
  const save = () => {
    const all = [...existing, ...found];
    writeFileSync(OUT + '.tmp', JSON.stringify(all));
    renameSync(OUT + '.tmp', OUT);
    return all.length;
  };

  const worker = async (w: number) => {
    const eng = nodeEngine({ Hash: 32 });
    const ana = nodeEngine({ Hash: 64 });
    while (started < games) {
      const g = started++;
      const chess = new Chess();
      const moves: string[] = [];
      const bookPlies = 4 + Math.floor(Math.random() * 14);
      // How loosely this game's moves are chosen (centipawns of softmax temperature).
      const temp = 20 + Math.random() * 110;
      let made = 0;
      const dbg = { pos: 0, cand: 0, quick: 0, deep: 0, line: 0 };
      while (!chess.isGameOver() && moves.length < 140) {
        const fen = chess.fen();
        const mover = chess.turn();
        const legal = chess.moves({ verbose: true }).length;
        let next: string | null = null;
        if (moves.length < bookPlies) {
          const opts = book.weightedMovesFrom(fen);
          if (opts.length) next = pick(opts.map((o) => ({ item: o.uci, w: o.weight })));
        }
        if (!next) {
          const res = await eng.analyse({ fen, limits: { depth: moves.length < 10 ? 6 : 8 }, multipv: Math.min(12, legal) });
          const lines = res.lines.filter((l) => l.pv.length);
          if (!lines.length) break;
          const bestCp = cpFor(lines[0], mover);
          // Mine this position: which of the natural-looking moves would be a mistake with one punishment?
          if (moves.length >= 10 && made < PER_GAME && Math.abs(bestCp) <= 250) {
            dbg.pos++;
            const blunders = lines.filter((l) => bestCp - cpFor(l, mover) >= 250 && cpFor(l, mover) <= -180 && !isMateFor(l, mover));
            for (const b of blunders.sort(() => Math.random() - 0.5).slice(0, 3)) {
              const start = new Chess(fen);
              playUci(start, b.pv[0]);
              const pfen = start.fen();
              if (seen.has(epd(pfen)) || start.isGameOver()) continue;
              dbg.cand++;
              const solver = other(mover);
              const quick = await ana.analyse({ fen: pfen, limits: { depth: 10 }, multipv: 2 });
              if (ep(quick.lines[0], solver) < 0.7 || !uniqueBest(quick.lines, solver)) continue;
              // Taking a piece that was simply left hanging is the commonest puzzle by far: skip most before the deep check.
              const reply = quick.lines[0].pv[0];
              if (hangingPieces(start, mover).some((h) => h.square === reply.slice(2, 4)) && Math.random() > SKIP_PLAIN) continue;
              dbg.quick++;
              const deep = await ana.analyse({ fen: pfen, limits: { depth: 16, movetime: 2500 }, multipv: 2 });
              if (ep(deep.lines[0], solver) < 0.68) continue;
              dbg.deep++;
              const line = await solve(ana, pfen, solver, deep.lines);
              if (!line) continue;
              const end = new Chess(pfen);
              for (const u of line) playUci(end, u);
              if (!end.isCheckmate() && lineMaterial(pfen, line, solver, 12).delta < 2) continue;
              const themes = tagPuzzle(pfen, line);
              if (!themes.length) continue;
              if (!themes.some((t) => RICH.includes(t)) && Math.random() > (themes.includes('mateIn1') ? 0.5 : 0.4)) continue;
              dbg.line++;
              seen.add(epd(pfen));
              const p: TacticPuzzle = { id: `m${Date.now().toString(36)}${w}${made}`, fen, moves: [b.pv[0], ...line], themes, rating: 0 };
              p.rating = puzzleRating(p);
              found.push(p);
              made++;
              break;
            }
          }
          // The game goes on with one of the top moves, chosen loosely.
          const top = lines.slice(0, 6);
          next = pick(top.map((l) => ({ item: l.pv[0], w: Math.exp((cpFor(l, mover) - bestCp) / temp) })));
        }
        playUci(chess, next);
        moves.push(next);
      }
      process.stdout.write(
        `\n[w${w}] game ${g + 1}/${games} (${moves.length} plies, t=${temp.toFixed(0)}): +${made} ${JSON.stringify(dbg)}, total ${save()}`,
      );
    }
    eng.terminate();
    ana.terminate();
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
  console.log(`DONE: ${found.length} new puzzles, ${save()} total`);
});
