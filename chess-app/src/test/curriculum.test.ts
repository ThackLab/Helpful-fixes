// Checks the tactics course. The legality checks always run; the engine checks
// (solutions are best and clearly better than the alternatives) run with:
//   CURRICULUM=1 npx vitest run src/test/curriculum.test.ts --silent=false
import { Chess, type Color } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { LESSONS, type LessonStep } from '../lib/learn/curriculum';
import { playUci, sanLine } from '../lib/chess/utils';
import type { PvLine } from '../lib/engine/uci';
import { nodeEngine } from './nodeEngine';

const SQUARE = /^[a-h][1-8]$/;

function otherSideInCheck(fen: string) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' ')).inCheck();
  } catch {
    return false;
  }
}

function linesOf(step: LessonStep): string[] {
  if (step.kind === 'puzzle') return step.line;
  if (step.kind === 'walk') return step.moves.map((m) => m.uci);
  return [];
}

describe('curriculum', () => {
  it('has unique lesson ids', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });
  for (const lesson of LESSONS)
    it(`${lesson.id}: positions and moves are legal`, () => {
      for (const step of lesson.steps) {
        const where = `${lesson.id} / ${step.title}`;
        const chess = new Chess(step.fen);
        expect(otherSideInCheck(step.fen), `${where}: side not to move is in check`).toBe(false);
        if (step.kind === 'info') {
          for (const a of step.arrows ?? []) {
            const sq = a.replace(/^[rby]:/, '');
            expect(SQUARE.test(sq.slice(0, 2)) && SQUARE.test(sq.slice(2, 4)), `${where}: arrow ${a}`).toBe(true);
          }
          for (const m of step.marks ?? []) expect(SQUARE.test(m), `${where}: mark ${m}`).toBe(true);
        }
        for (const uci of linesOf(step)) expect(playUci(chess, uci), `${where}: illegal ${uci} in ${chess.fen()}`).toBeTruthy();
        if (step.kind === 'puzzle') {
          expect(step.line.length % 2, `${where}: line must end with the solver's move`).toBe(1);
          if (step.anyMate) expect(chess.isCheckmate(), `${where}: line should end in mate`).toBe(true);
          for (const alt of step.alts ?? []) expect(playUci(new Chess(step.fen), alt), `${where}: alt ${alt}`).toBeTruthy();
        }
      }
    });
});

const cp = (l: PvLine, c: Color) =>
  (l.score.type === 'mate' ? (l.score.value > 0 ? 100000 - l.score.value : -100000 - l.score.value) : l.score.value) * (c === 'w' ? 1 : -1);
const show = (fen: string, l: PvLine) =>
  `${l.score.type === 'mate' ? `#${l.score.value}` : (l.score.value / 100).toFixed(2)} ${sanLine(fen, l.pv, 6).join(' ')}`;

it.skipIf(!process.env.CURRICULUM)('curriculum solutions are engine-verified', { timeout: 3_600_000 }, async () => {
  const engine = nodeEngine({ Hash: 64 });
  const problems: string[] = [];
  for (const lesson of LESSONS)
    for (const step of lesson.steps) {
      if (step.kind !== 'puzzle') continue;
      const where = `${lesson.id} / ${step.title}`;
      const chess = new Chess(step.fen);
      const solver = chess.turn();
      for (let i = 0; i < step.line.length; i++) {
        const fen = chess.fen();
        const uci = step.line[i];
        const r = await engine.analyse({ fen, limits: { depth: 20 }, multipv: 3 });
        const best = r.lines[0];
        if (i % 2 === 0) {
          const playedLine = r.lines.find((l) => l.pv[0] === uci);
          const last = i === step.line.length - 1;
          const after = new Chess(fen);
          playUci(after, uci);
          const mates = after.isCheckmate();
          if (!(last && step.anyMate && mates)) {
            if (!playedLine) problems.push(`${where}: move ${i + 1} ${uci} not in top lines: ${r.lines.map((l) => show(fen, l)).join(' | ')}`);
            else if (cp(best, solver) - cp(playedLine, solver) > 30) problems.push(`${where}: move ${i + 1} ${uci} is worse than ${show(fen, best)}`);
            const alt = r.lines.find((l) => l.pv[0] !== uci && !(i === 0 && step.alts?.includes(l.pv[0])));
            // Later moves only need to be good: the lesson player accepts equally good follow-ups.
            if (i === 0 && playedLine && alt && cp(playedLine, solver) - cp(alt, solver) < 100)
              problems.push(`${where}: move ${i + 1} ${uci} not unique; also ${show(fen, alt)}`);
          }
        } else if (best && best.pv[0] !== uci) {
          const reply = r.lines.find((l) => l.pv[0] === uci);
          if (!reply || cp(reply, solver) - cp(best, solver) > 60)
            problems.push(`${where}: reply ${uci} is not a good defence; best is ${show(fen, best)}`);
        }
        playUci(chess, uci);
      }
    }
  engine.terminate();
  if (problems.length) process.stdout.write('\nPROBLEMS:\n' + problems.join('\n') + '\n');
  expect(problems).toEqual([]);
});
