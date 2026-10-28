// Checks the courses. The legality checks always run; the engine checks
// (solutions are best and clearly better than the alternatives, quiz answers
// are right, drills start from a position that fits the goal) run with:
//   CURRICULUM=1 npx vitest run src/test/curriculum.test.ts --silent=false
// (or CURRICULUM=forks,pins for just those lessons)
import { Chess, type Color } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { LESSONS, type LessonStep } from '../lib/learn/curriculum';
import { playUci, sanLine } from '../lib/chess/utils';
import type { PvLine } from '../lib/engine/uci';
import { expectedFor } from '../lib/review/winprob';
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
        if (step.kind === 'info' || step.kind === 'pattern' || step.kind === 'tap') {
          for (const a of step.arrows ?? []) {
            const sq = a.replace(/^[rby]:/, '');
            expect(SQUARE.test(sq.slice(0, 2)) && SQUARE.test(sq.slice(2, 4)), `${where}: arrow ${a}`).toBe(true);
          }
          for (const m of step.kind === 'tap' ? step.answers : (step.marks ?? [])) expect(SQUARE.test(m), `${where}: square ${m}`).toBe(true);
        }
        if (step.kind === 'tap') expect(step.answers.length, `${where}: no answer`).toBeGreaterThan(0);
        for (const uci of linesOf(step)) expect(playUci(chess, uci), `${where}: illegal ${uci} in ${chess.fen()}`).toBeTruthy();
        if (step.kind === 'quiz') {
          expect(
            step.options.some((o) => o.correct),
            `${where}: no correct option`,
          ).toBe(true);
          for (const o of step.options) {
            if (o.uci) expect(playUci(new Chess(step.fen), o.uci), `${where}: illegal option ${o.uci}`).toBeTruthy();
            for (const a of o.arrows ?? []) expect(SQUARE.test(a.replace(/^[rby]:/, '').slice(2, 4)), `${where}: arrow ${a}`).toBe(true);
          }
        }
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
  const problems: string[] = [];
  // CURRICULUM=1 checks every lesson; a comma-separated list of lesson ids checks just those.
  const only = process.env.CURRICULUM === '1' ? null : new Set(process.env.CURRICULUM!.split(','));
  const steps = LESSONS.filter((l) => !only || only.has(l.id)).flatMap((lesson) => lesson.steps.map((step) => ({ lesson, step })));
  let next = 0;
  const check = async (engine: ReturnType<typeof nodeEngine>, lesson: (typeof LESSONS)[number], step: LessonStep) => {
    if (step.kind === 'quiz') return checkQuiz(engine, `${lesson.id} / ${step.title}`, step);
    if (step.kind === 'drill') return checkDrill(engine, `${lesson.id} / ${step.title}`, step);
    if (step.kind !== 'puzzle') return;
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
        let replyCp = reply ? cp(reply, solver) : undefined;
        if (replyCp === undefined) {
          const after = new Chess(fen);
          playUci(after, uci);
          replyCp = after.isGameOver()
            ? undefined
            : cp((await engine.analyse({ fen: after.fen(), limits: { depth: 19 }, multipv: 1 })).lines[0], solver);
        }
        // Once every defence loses outright, any of them will do.
        const lost = replyCp !== undefined && cp(best, solver) >= 800 && replyCp >= 800;
        if (!lost && (replyCp === undefined || replyCp - cp(best, solver) > 60))
          problems.push(`${where}: reply ${uci} is not a good defence; best is ${show(fen, best)}`);
      }
      playUci(chess, uci);
    }
  };
  // Quiz moves, in expected points: every right answer is close to Stockfish's best move, and every wrong one is clearly
  // worse than the right ones.
  const checkQuiz = async (engine: ReturnType<typeof nodeEngine>, where: string, step: Extract<LessonStep, { kind: 'quiz' }>) => {
    const withMoves = step.options.filter((o) => o.uci);
    if (!withMoves.length) return;
    const mover = new Chess(step.fen).turn();
    const root = await engine.analyse({ fen: step.fen, limits: { depth: 22 }, multipv: 1 });
    const best = expectedFor(root.lines[0].score, mover);
    const scored: { label: string; correct: boolean; v: number }[] = [];
    for (const o of withMoves) {
      const c = new Chess(step.fen);
      playUci(c, o.uci!);
      let v: number;
      if (c.isCheckmate()) v = 1;
      else if (c.isDraw()) v = 0.5;
      else v = expectedFor((await engine.analyse({ fen: c.fen(), limits: { depth: 21 }, multipv: 1 })).lines[0].score, mover);
      scored.push({ label: o.label, correct: !!o.correct, v });
    }
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    const right = scored.filter((x) => x.correct);
    const worstRight = Math.min(...right.map((x) => x.v));
    for (const x of right)
      if (best - x.v > 0.06)
        problems.push(`${where}: right answer "${x.label}" (${pct(x.v)}) is well below ${show(step.fen, root.lines[0])} (${pct(best)})`);
    for (const x of scored.filter((y) => !y.correct))
      if (worstRight - x.v < 0.03)
        problems.push(`${where}: wrong answer "${x.label}" (${pct(x.v)}) is about as good as the right one (${pct(worstRight)})`);
  };
  // Drills start from a position the goal fits: a win to win, a draw to hold.
  const checkDrill = async (engine: ReturnType<typeof nodeEngine>, where: string, step: Extract<LessonStep, { kind: 'drill' }>) => {
    const r = await engine.analyse({ fen: step.fen, limits: { depth: 22 }, multipv: 1 });
    const v = cp(r.lines[0], new Chess(step.fen).turn());
    if (step.goal === 'hold' ? Math.abs(v) > 60 : v < 300) problems.push(`${where}: ${step.goal} drill starts at ${show(step.fen, r.lines[0])}`);
  };
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      const engine = nodeEngine({ Hash: 64 });
      while (next < steps.length) {
        const { lesson, step } = steps[next++];
        await check(engine, lesson, step);
      }
      engine.terminate();
    }),
  );
  if (problems.length) process.stdout.write('\nPROBLEMS:\n' + problems.join('\n') + '\n');
  expect(problems).toEqual([]);
});
