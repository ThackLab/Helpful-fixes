// Analyses the live game in the background at the review's depth, newest
// position first, so the review after the game finds most positions already
// done. Uses its own single-threaded engine and stops when the game page
// closes.
import { Chess } from 'chess.js';
import type { Engine } from '../lib/engine/engine';
import { createSingleEngine } from '../lib/engine/manager';
import { sanLine } from '../lib/chess/utils';
import { getEval, putEval } from '../lib/review/evalCache';
import type { PositionEval } from '../lib/review/types';

const MULTIPV = 3;

let engine: Engine | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let wanted: { startFen: string; moves: string[]; depth: number } | null = null;
let running = false;
const done = new Set<string>();

/** Every position of the game, with whether the game is over there. */
function positionsOf(startFen: string, moves: string[]): { fen: string; over: boolean }[] {
  const c = new Chess(startFen);
  const out = [{ fen: c.fen(), over: c.isGameOver() }];
  for (const u of moves) {
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    out.push({ fen: c.fen(), over: c.isGameOver() });
  }
  return out;
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = wanted;
      if (!job) break;
      // Newest position first: the end of the game is what the review needs last.
      const positions = positionsOf(job.startFen, job.moves);
      let target = -1;
      for (let i = positions.length - 1; i >= 0; i--) {
        const key = `${positions[i].fen}|${job.depth}`;
        if (done.has(key) || positions[i].over) continue;
        if (await getEval(positions[i].fen, job.depth, MULTIPV)) {
          done.add(key);
          continue;
        }
        target = i;
        break;
      }
      if (target < 0) break;
      engine ??= createSingleEngine(32);
      const fen = positions[target].fen;
      const res = await engine.analyse({
        fen: job.startFen,
        moves: job.moves.slice(0, target),
        limits: { depth: job.depth, movetime: 8000 },
        multipv: MULTIPV,
      });
      const pos: PositionEval = {
        fen,
        depth: res.depth,
        lines: res.lines.filter((l) => l.pv.length).map((l) => ({ score: l.score, pv: l.pv, san: sanLine(fen, l.pv, 12), depth: l.depth })),
      };
      if (pos.depth >= job.depth) await putEval(pos, MULTIPV);
      done.add(`${fen}|${job.depth}`);
    }
  } catch {
    /* the engine was stopped or failed; the review will search what is missing */
  } finally {
    running = false;
  }
}

/** Keeps the background analysis up to date with the live game. */
export function analyseLive(startFen: string, moves: string[], depth: number) {
  clearTimeout(idleTimer);
  wanted = { startFen, moves: [...moves], depth };
  void pump();
}

/** Stops after the current search; the engine is shut down if nothing new comes in a while. */
export function pauseLive() {
  wanted = null;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (wanted || running) return;
    engine?.terminate();
    engine = null;
  }, 30_000);
}
