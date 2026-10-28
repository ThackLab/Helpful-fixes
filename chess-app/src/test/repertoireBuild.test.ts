// Builds the opening repertoires (public/repertoires.json) from the lichess
// opening graph. From each opening's starting moves, your side always plays one
// move: the most popular book move among those Stockfish rates within a few
// centipawns of the best one. The other side plays its main book replies (the
// popular ones, up to four), so a repertoire answers what you will meet.
// Run with: REPERTOIRE=1 npx vitest run src/test/repertoireBuild.test.ts --silent=false
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess, type Color } from 'chess.js';
import { it } from 'vitest';
import { setOpeningBook } from '../lib/chess/openings';
import { playUci } from '../lib/chess/utils';
import { REPERTOIRE_PACKS, type RepNode } from '../lib/learn/repertoire';
import { nodeEngine } from './nodeEngine';

/** How far past the opening's starting moves a line goes (plies). */
const EXTRA_PLIES = 12;
/** Book moves for your side within this of the best one count as equally good. */
const EQUAL_CP = 25;

it.skipIf(!process.env.REPERTOIRE)('build opening repertoires', { timeout: 6 * 3_600_000 }, async () => {
  const book = setOpeningBook(JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8')));
  const engine = nodeEngine({ Hash: 64 });
  const out: { id: string; tree: RepNode[]; lines: number }[] = [];

  for (const pack of REPERTOIRE_PACKS) {
    const chess = new Chess();
    const root: string[] = [];
    for (const san of pack.root.split(' ')) {
      const m = chess.move(san);
      root.push(m.from + m.to + (m.promotion ?? ''));
    }
    let lines = 0;
    /** A system opening's next set-up move, if Stockfish rates it about as good as the best. */
    const preferred = (
      c: Chess,
      scored: { pv: string[]; score: { type: string; value: number } }[],
      sign: number,
      best: number,
    ): string | undefined => {
      for (const san of pack.prefer ?? []) {
        const t = new Chess(c.fen());
        let uci: string;
        try {
          const m = t.move(san);
          uci = m.from + m.to + (m.promotion ?? '');
        } catch {
          continue;
        }
        const l = scored.find((x) => x.pv[0] === uci);
        if (l && sign * (l.score.type === 'mate' ? Math.sign(l.score.value) * 10000 : l.score.value) >= best - EQUAL_CP - 15) return uci;
      }
      return undefined;
    };
    const grow = async (c: Chess, depth: number): Promise<RepNode[]> => {
      if (depth >= EXTRA_PLIES || c.isGameOver()) return [];
      const fen = c.fen();
      const moves = book.weightedMovesFrom(fen).filter((m) => {
        const t = new Chess(fen);
        return !!playUci(t, m.uci);
      });
      const turn: Color = c.turn();
      let picked: string[];
      if (!moves.length) {
        // Past the book: Stockfish's move, so every line reaches the same depth. Early on,
        // the other side also gets its next-best replies, so system openings branch too.
        const wide = turn !== pack.color && depth < 4;
        const r = await engine.analyse({ fen, limits: { depth: 16 }, multipv: wide ? 3 : turn === pack.color && pack.prefer ? 6 : 1 });
        const sign = turn === 'w' ? 1 : -1;
        const cp = (l: (typeof r.lines)[number]) => sign * (l.score.type === 'mate' ? Math.sign(l.score.value) * 10000 : l.score.value);
        const top = r.lines[0];
        if (!top?.pv[0]) return [];
        picked =
          turn === pack.color
            ? [preferred(c, r.lines, sign, cp(top)) ?? top.pv[0]]
            : r.lines.filter((l) => l.pv[0] && cp(l) >= cp(top) - 40).map((l) => l.pv[0]);
      } else if (turn === pack.color) {
        const r = await engine.analyse({ fen, limits: { depth: 16 }, multipv: pack.prefer ? 6 : Math.min(5, moves.length + 2) });
        const sign = turn === 'w' ? 1 : -1;
        const cp = (uci: string) => {
          const l = r.lines.find((x) => x.pv[0] === uci);
          if (!l) return -Infinity;
          return sign * (l.score.type === 'mate' ? Math.sign(l.score.value) * 10000 : l.score.value);
        };
        const scored = moves.map((m) => ({ ...m, cp: cp(m.uci) })).filter((m) => m.cp > -Infinity);
        if (!scored.length) return [];
        const best = Math.max(...scored.map((m) => m.cp));
        const good = scored.filter((m) => m.cp >= best - EQUAL_CP).sort((a, b) => b.weight - a.weight);
        const top = r.lines[0]
          ? sign * (r.lines[0].score.type === 'mate' ? Math.sign(r.lines[0].score.value) * 10000 : r.lines[0].score.value)
          : best;
        picked = [preferred(c, r.lines, sign, Math.max(best, top)) ?? good[0].uci];
      } else {
        const total = moves.reduce((a, m) => a + m.weight, 0);
        // Wide near the start, then only the main replies, so a pack stays learnable.
        const maxReplies = depth < 2 ? 4 : depth < 4 ? 3 : depth < 8 ? 2 : 1;
        picked = [...moves]
          .sort((a, b) => b.weight - a.weight)
          .filter((m, i) => i === 0 || m.weight >= total * 0.05)
          .slice(0, maxReplies)
          .map((m) => m.uci);
        // The book's weights follow how much theory a move has, not how often it is played, so
        // early on the engine's main replies are added too.
        if (picked.length < maxReplies && depth < 6) {
          const r = await engine.analyse({ fen, limits: { depth: 14 }, multipv: 4 });
          const sign = turn === 'w' ? 1 : -1;
          const cp = (l: (typeof r.lines)[number]) => sign * (l.score.type === 'mate' ? Math.sign(l.score.value) * 10000 : l.score.value);
          const top = r.lines[0] ? cp(r.lines[0]) : 0;
          for (const l of r.lines) if (picked.length < maxReplies && l.pv[0] && !picked.includes(l.pv[0]) && cp(l) >= top - 40) picked.push(l.pv[0]);
        }
      }
      const nodes: RepNode[] = [];
      for (const uci of picked) {
        const t = new Chess(fen);
        const m = playUci(t, uci)!;
        const children = await grow(t, depth + 1);
        if (!children.length) lines++;
        nodes.push(children.length ? { m: uci, s: m.san, c: children } : { m: uci, s: m.san });
      }
      return nodes;
    };
    const tree = await grow(chess, 0);
    out.push({ id: pack.id, tree, lines });
    process.stdout.write(`\n${pack.id}: ${lines} lines`);
  }
  writeFileSync(fileURLToPath(new URL('../../public/repertoires.json', import.meta.url)), JSON.stringify(out));
  engine.terminate();
});
