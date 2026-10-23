// Generates themed tactics puzzles from bot-vs-bot games. Run with:
//   PUZZLE_GEN="<games>,<workers>" npx vitest run src/test/puzzleGen.test.ts --silent=false
// New puzzles are merged into public/puzzles.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess, type Color } from 'chess.js';
import { it } from 'vitest';
import { customBot } from '../lib/bots/bots';
import { chooseBotMove } from '../lib/bots/brain';
import { setOpeningBook } from '../lib/chess/openings';
import { lineMaterial } from '../lib/chess/tactics';
import { epd, playUci } from '../lib/chess/utils';
import type { Engine } from '../lib/engine/engine';
import type { PvLine } from '../lib/engine/uci';
import { tagPuzzle } from '../lib/learn/tags';
import { puzzleRating, type TacticPuzzle } from '../lib/learn/puzzles';
import { expectedFor } from '../lib/review/winprob';
import { nodeEngine } from './nodeEngine';

const OUT = fileURLToPath(new URL('../../public/puzzles.json', import.meta.url));

const ep = (l: PvLine | undefined, c: Color) => (l ? expectedFor(l.score, c) : 0);
const isMateFor = (l: PvLine | undefined, c: Color) => !!l && l.score.type === 'mate' && l.score.value > 0 === (c === 'w');
const cpFor = (l: PvLine, c: Color) => (l.score.type === 'mate' ? (l.score.value > 0 ? 10000 : -10000) : l.score.value) * (c === 'w' ? 1 : -1);

/** The best move is the only one that works: mate in one, or clearly better than every alternative. */
function uniqueBest(lines: PvLine[], c: Color): boolean {
  const [best, second] = lines;
  if (!best?.pv.length) return false;
  if (isMateFor(best, c) && best.score.type === 'mate' && Math.abs(best.score.value) === 1) return true;
  if (!second) return true;
  if (isMateFor(second, c)) return false;
  return cpFor(best, c) - cpFor(second, c) >= 150 && ep(best, c) - ep(second, c) >= 0.15;
}

async function playGame(bot: Engine, book: ReturnType<typeof setOpeningBook>, eloW: number, eloB: number) {
  const chess = new Chess();
  const moves: string[] = [];
  while (!chess.isGameOver() && moves.length < 160) {
    const elo = chess.turn() === 'w' ? eloW : eloB;
    const mv = await chooseBotMove(bot, { startFen: new Chess().fen(), moves, bot: customBot(elo), book });
    playUci(chess, mv.uci);
    moves.push(mv.uci);
  }
  return moves;
}

/** Follows the engine's line while the solver's move stays unique. */
async function solve(ana: Engine, fen: string, solver: Color, first: PvLine[]): Promise<string[] | null> {
  const line: string[] = [];
  let lines = first;
  const chess = new Chess(fen);
  for (let step = 0; step < 4; step++) {
    const best = lines[0];
    if (!uniqueBest(lines, solver)) break;
    line.push(best.pv[0]);
    playUci(chess, best.pv[0]);
    if (chess.isGameOver()) break;
    // The puzzle may end once the gain is banked and the next move isn't forced.
    const reply = await ana.analyse({ fen: chess.fen(), limits: { depth: 16 }, multipv: 1 });
    const r = reply.lines[0]?.pv[0];
    if (!r) break;
    const probe = new Chess(chess.fen());
    playUci(probe, r);
    const next = await ana.analyse({ fen: probe.fen(), limits: { depth: 16 }, multipv: 2 });
    if (!uniqueBest(next.lines, solver) || step === 3) break;
    line.push(r);
    playUci(chess, r);
    lines = next.lines;
  }
  if (!line.length || line.length % 2 === 0) return line.length ? line.slice(0, -1) : null;
  return line;
}

it.skipIf(!process.env.PUZZLE_GEN)('generate puzzles', { timeout: 6 * 3_600_000 }, async () => {
  const [games, workers] = process.env.PUZZLE_GEN!.split(',').map(Number);
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const existing: TacticPuzzle[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const seen = new Set(existing.map((p) => epd(p.fen)));
  const found: TacticPuzzle[] = [];
  let started = 0;
  const save = () => {
    const all = [...existing, ...found];
    writeFileSync(OUT, JSON.stringify(all));
    return all.length;
  };

  const worker = async (w: number) => {
    const bot = nodeEngine();
    const ana = nodeEngine({ Hash: 32 });
    while (started < games) {
      const g = started++;
      const eloW = 900 + Math.floor(Math.random() * 1100);
      const eloB = 900 + Math.floor(Math.random() * 1100);
      const moves = await playGame(bot, book, eloW, eloB);
      // Quick pass: evaluation of every position.
      const chess = new Chess();
      const fens = [chess.fen()];
      for (const u of moves) {
        playUci(chess, u);
        fens.push(chess.fen());
      }
      const quick: (PvLine | undefined)[] = [];
      for (const f of fens) quick.push((await ana.analyse({ fen: f, limits: { depth: 10 }, multipv: 1 })).lines[0]);
      let made = 0;
      if (process.env.PG_DEBUG) process.stdout.write('\n' + quick.map((l, i) => `${i}:${l?.score.type}${l?.score.value}`).join(' ') + '\n');
      const dbg = { cand: 0, deep: 0, line: 0, mat: 0 };
      for (let i = 8; i < fens.length - 1; i++) {
        const solver: Color = fens[i].split(' ')[1] as Color;
        const before = ep(quick[i - 1], solver);
        const after = ep(quick[i], solver);
        if (after < 0.68 || after - before < 0.2 || before > 0.75) continue;
        if (seen.has(epd(fens[i]))) continue;
        dbg.cand++;
        const deep = await ana.analyse({ fen: fens[i], limits: { depth: 18 }, multipv: 2 });
        if (ep(deep.lines[0], solver) < 0.68) continue;
        dbg.deep++;
        const line = await solve(ana, fens[i], solver, deep.lines);
        if (process.env.PG_DEBUG)
          process.stdout.write(`\nCAND ${fens[i]} ${deep.lines.map((l) => `${l.pv[0]} ${l.score.type}${l.score.value}`).join(' | ')} -> ${line}\n`);
        if (!line) continue;
        dbg.line++;
        const material = lineMaterial(fens[i], line, solver, 12);
        const check = new Chess(fens[i]);
        for (const u of line) playUci(check, u);
        const mate = check.isCheckmate();
        if (!mate && material.delta < 2) continue;
        dbg.mat++;
        const themes = tagPuzzle(fens[i], line);
        if (!themes.length) continue;
        // Free pieces are common and easy: keep only a few of them.
        if (themes.length === 1 && themes[0] === 'hanging' && Math.random() > 0.15) continue;
        seen.add(epd(fens[i]));
        const p: TacticPuzzle = {
          id: `g${Date.now().toString(36)}${w}${made}`,
          fen: fens[i - 1],
          moves: [moves[i - 1], ...line],
          themes,
          rating: 0,
        };
        p.rating = puzzleRating(p);
        found.push(p);
        made++;
      }
      process.stdout.write(
        `\n[w${w}] game ${g + 1}/${games} (${eloW} v ${eloB}, ${moves.length} plies): +${made} ${JSON.stringify(dbg)}, total ${save()}`,
      );
    }
    bot.terminate();
    ana.terminate();
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
  console.log(`DONE: ${found.length} new puzzles, ${save()} total`);
});
