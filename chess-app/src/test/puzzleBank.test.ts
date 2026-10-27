// Builds the app's puzzle bank (public/puzzles.json) from the mined puzzles and
// their bot ratings: only rated puzzles, near-duplicates dropped, and plain
// "take the free piece" puzzles capped so the bank isn't dominated by them.
// Run with: PUZZLE_BANK=1 npx vitest run src/test/puzzleBank.test.ts --silent=false
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import type { TacticPuzzle } from '../lib/learn/puzzles';
import { playUci } from '../lib/chess/utils';
import { RATINGS } from './puzzleRate.test';

const MINED = fileURLToPath(new URL('../../data/puzzles-mined.json', import.meta.url));
const OUT = fileURLToPath(new URL('../../public/puzzles.json', import.meta.url));
/** Most plain free-piece puzzles kept, per 100 rating points. */
const PLAIN_PER_BAND = 40;

it.skipIf(!process.env.PUZZLE_BANK)('build the puzzle bank', () => {
  const mined: TacticPuzzle[] = JSON.parse(readFileSync(MINED, 'utf8'));
  const ratings: Record<string, { rating: number }> = JSON.parse(readFileSync(RATINGS, 'utf8'));
  const seen = new Set<string>();
  const plainPerBand = new Map<number, number>();
  const out: TacticPuzzle[] = [];
  // Rich puzzles first, so the cap only ever drops plain ones.
  const plain = (p: TacticPuzzle) => p.themes.every((t) => t === 'hanging');
  for (const p of [...mined].sort((a, b) => Number(plain(a)) - Number(plain(b)) || Math.random() - 0.5)) {
    const r = ratings[p.id];
    if (!r) continue;
    // One puzzle per position after the mistake.
    const c = new Chess(p.fen);
    playUci(c, p.moves[0]);
    const key = c.fen().split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    if (plain(p)) {
      const band = Math.floor(r.rating / 100);
      const n = plainPerBand.get(band) ?? 0;
      if (n >= PLAIN_PER_BAND) continue;
      plainPerBand.set(band, n + 1);
    }
    out.push({ id: p.id, fen: p.fen, moves: p.moves, themes: p.themes, rating: r.rating });
  }
  out.sort((a, b) => a.rating - b.rating);
  writeFileSync(OUT, JSON.stringify(out));
  const byTheme = new Map<string, number>();
  for (const p of out) for (const t of p.themes) byTheme.set(t, (byTheme.get(t) ?? 0) + 1);
  const bands = new Map<number, number>();
  for (const p of out) bands.set(Math.floor(p.rating / 200) * 200, (bands.get(Math.floor(p.rating / 200) * 200) ?? 0) + 1);
  process.stdout.write(`\nbank: ${out.length} puzzles (of ${mined.length} mined, ${Object.keys(ratings).length} rated)`);
  process.stdout.write(
    '\n' +
      [...byTheme.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${t} ${n}`)
        .join(', '),
  );
  process.stdout.write(
    '\n' +
      [...bands.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([b, n]) => `${b}+: ${n}`)
        .join(', ') +
      '\n',
  );
});
