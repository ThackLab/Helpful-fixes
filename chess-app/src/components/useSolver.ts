// Shared state machine for "find the move" exercises: lesson puzzles and the tactics trainer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import { getAnalysisEngine } from '../lib/engine/manager';
import { legalDests, moveToUci, playUci, sanLine } from '../lib/chess/utils';
import { hintsFor, refutationText } from '../lib/review/hints';
import { expectedFor } from '../lib/review/winprob';
import { playSound, soundForSan } from '../lib/sound';
import type { PromotionPiece } from './Board';

export type SolverState = 'intro' | 'solve' | 'checking' | 'wrong' | 'solved' | 'revealed';

export interface SolverInput {
  fen: string;
  /** Solver's move, reply, solver's move ... ending with the solver's move. */
  line: string[];
  /** Opponent move played (animated) before the solver starts. */
  startMove?: string;
  alts?: string[];
  anyMate?: boolean;
  /** Custom first hint (defaults to the generated one). */
  hint?: string;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSolver(input: SolverInput | null) {
  const [rawState, setState] = useState<SolverState>('intro');
  // The exercise the state belongs to: until the reset below has run for a new
  // exercise, report 'intro' rather than the previous exercise's result.
  const [owner, setOwner] = useState<SolverInput | null>(null);
  const state: SolverState = owner === input ? rawState : 'intro';
  const [ply, setPly] = useState(0);
  const [tried, setTried] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [failed, setFailed] = useState(false);
  const [alt, setAlt] = useState(false);
  const token = useRef(0);

  const base = useMemo(() => {
    if (!input) return null;
    const c = new Chess(input.fen);
    if (input.startMove) playUci(c, input.startMove);
    return c.fen();
  }, [input]);
  const solver: Color | null = base ? (base.split(' ')[1] as Color) : null;

  // Reset whenever the exercise changes, then animate the opponent's move.
  useEffect(() => {
    const t = ++token.current;
    setPly(0);
    setTried(null);
    setMessage(null);
    setHintLevel(0);
    setFailed(false);
    setAlt(false);
    setOwner(input);
    if (!input) return;
    if (input.startMove) {
      setState('intro');
      void pause(650).then(() => {
        if (token.current !== t) return;
        playSound(soundForSan(sanLine(input.fen, [input.startMove!])[0] ?? ''));
        setState('solve');
      });
    } else setState('solve');
  }, [input]);

  const played = useMemo(() => {
    if (!input || !base) return [];
    const extra = (state === 'wrong' || state === 'checking') && tried ? [tried] : [];
    return [...input.line.slice(0, ply), ...extra];
  }, [input, base, ply, state, tried]);

  const view = useMemo(() => {
    if (!input || !base) return null;
    if (state === 'intro') {
      const c = new Chess(input.fen);
      return { fen: input.fen, lastMove: undefined as [string, string] | undefined, check: c.inCheck(), chess: c };
    }
    const c = new Chess(base);
    let last: string | undefined = input.startMove;
    for (const u of played) {
      playUci(c, u);
      last = u;
    }
    return { fen: c.fen(), lastMove: last ? ([last.slice(0, 2), last.slice(2, 4)] as [string, string]) : undefined, check: c.inCheck(), chess: c };
  }, [input, base, played, state]);

  const hints = useMemo(() => {
    if (!input || !base || ply >= input.line.length) return null;
    const c = new Chess(base);
    for (const u of input.line.slice(0, ply)) playUci(c, u);
    const uci = input.line[ply];
    const san = sanLine(c.fen(), [uci])[0] ?? '';
    const h = hintsFor(c.fen(), uci, san, { line: sanLine(c.fen(), input.line.slice(ply)) });
    return { ...h, idea: ply === 0 && input.hint ? input.hint : h.idea };
  }, [input, base, ply]);

  const finish = useCallback((how: 'solved' | 'revealed') => {
    setState(how);
    playSound(how === 'solved' ? 'correct' : 'move');
  }, []);

  const onMove = useCallback(
    async (from: string, to: string, promotion?: PromotionPiece) => {
      if (!input || !base || !solver || state !== 'solve') return;
      const t = token.current;
      const c = new Chess(base);
      for (const u of input.line.slice(0, ply)) playUci(c, u);
      const before = c.fen();
      const mv = playUci(c, from + to + (promotion ?? ''));
      if (!mv) return;
      const uci = moveToUci(mv);
      playSound(soundForSan(mv.san));
      const expected = input.line[ply];
      const last = ply === input.line.length - 1;
      const ok = uci === expected || (input.anyMate && last && c.isCheckmate());
      if (ok) {
        if (last) {
          setPly(ply + 1);
          finish('solved');
          return;
        }
        setPly(ply + 1);
        setHintLevel(0);
        await pause(450);
        if (token.current !== t) return;
        const reply = input.line[ply + 1];
        playSound(soundForSan(sanLine(c.fen(), [reply])[0] ?? ''));
        setPly(ply + 2);
        return;
      }
      if (ply === 0 && input.alts?.includes(uci)) {
        setTried(null);
        setAlt(true);
        setPly(input.line.length);
        finish('solved');
        return;
      }
      // Not the book move: accept it if the engine rates it as just as good.
      setTried(uci);
      setState('checking');
      const engine = getAnalysisEngine();
      const right = new Chess(before);
      playUci(right, expected);
      const [mine, best] = await Promise.all([
        engine.analyse({ fen: c.fen(), limits: { depth: 14, movetime: 2500 } }),
        engine.analyse({ fen: right.fen(), limits: { depth: 14, movetime: 2500 } }),
      ]);
      if (token.current !== t) return;
      const epMine = mine.lines[0] ? expectedFor(mine.lines[0].score, solver) : c.isCheckmate() ? 1 : 0;
      const epBest = best.lines[0] ? expectedFor(best.lines[0].score, solver) : 1;
      if (c.isCheckmate() || (ply > 0 && epMine >= epBest - 0.03) || (ply === 0 && epMine >= epBest - 0.01)) {
        setTried(null);
        setAlt(true);
        setPly(input.line.length);
        finish('solved');
        return;
      }
      setFailed(true);
      setMessage(refutationText(c.fen(), mine.lines[0]?.pv[0], epMine));
      setState('wrong');
      playSound('wrong');
    },
    [input, base, solver, state, ply, finish],
  );

  const retry = useCallback(() => {
    setTried(null);
    setMessage(null);
    setState('solve');
  }, []);

  const reveal = useCallback(async () => {
    if (!input) return;
    const t = ++token.current;
    setFailed(true);
    setTried(null);
    setMessage(null);
    setState('revealed');
    for (let p = ply; p < input.line.length; p++) {
      setPly(p + 1);
      playSound('move');
      await pause(700);
      if (token.current !== t) return;
    }
  }, [input, ply]);

  const hint = useCallback(() => {
    setHintLevel((h) => Math.min(2, h + 1));
  }, []);

  const dests = useMemo(() => (view && state === 'solve' ? legalDests(view.chess) : undefined), [view, state]);
  const highlights = useMemo(
    () => (hints && hintLevel >= 2 && state === 'solve' ? new Map([[hints.square, 'hl-key']]) : undefined),
    [hints, hintLevel, state],
  );

  return {
    state,
    view,
    dests,
    highlights,
    solver,
    ply,
    message,
    hints,
    hintLevel,
    failed,
    alt,
    tried,
    onMove,
    retry,
    reveal,
    hint,
  };
}
