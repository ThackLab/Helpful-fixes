import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board } from '../components/Board';
import { PageHead, SectionTitle } from '../components/ui';
import { Toggle } from '../components/Widgets';
import { Accent, Moves, Rich, San } from '../components/Rich';
import {
  REPERTOIRE_PACKS,
  deviation,
  findPack,
  linesOf,
  loadRepertoires,
  type PackTree,
  type RepLine,
  type RepertoirePack,
} from '../lib/learn/repertoire';
import { getOpeningBook, loadOpeningBook } from '../lib/chess/openings';
import { formatLine, legalDests, playUci } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { LEARNT_BOX, nextReviewText, useRepertoire, type LineProgress } from '../state/repertoire';

/** The opening's starting moves in UCI and SAN. */
function rootOf(pack: RepertoirePack): { moves: string[]; sans: string[] } {
  const c = new Chess();
  const moves: string[] = [];
  const sans: string[] = [];
  for (const san of pack.root.split(' ')) {
    const m = c.move(san);
    moves.push(m.from + m.to + (m.promotion ?? ''));
    sans.push(m.san);
  }
  return { moves, sans };
}

export function usePackLines(): Map<string, RepLine[]> | null {
  const [trees, setTrees] = useState<Map<string, PackTree> | null>(null);
  useEffect(() => {
    void loadRepertoires().then(setTrees);
  }, []);
  return useMemo(() => {
    if (!trees) return null;
    const out = new Map<string, RepLine[]>();
    for (const p of REPERTOIRE_PACKS) {
      const t = trees.get(p.id);
      if (t) out.set(p.id, linesOf(p, t.tree, rootOf(p)));
    }
    return out;
  }, [trees]);
}

/** Lines due now in your repertoire, plus up to two new ones a day to learn. */
export function dueLines(lines: Map<string, RepLine[]> | null, selected: string[], progress: Record<string, LineProgress>): number {
  if (!lines) return 0;
  let due = 0;
  let fresh = 0;
  for (const id of selected)
    for (const l of lines.get(id) ?? []) {
      if (!progress[l.id]) fresh++;
      else if (progress[l.id].due <= Date.now()) due++;
    }
  return due + Math.min(2, fresh);
}

/** `#/openings`: the openings you can add to your repertoire. */
export function OpeningsPage() {
  const lines = usePackLines();
  const { selected, lines: progress, toggle } = useRepertoire();
  const groups = ['White', 'Black against 1.e4', 'Black against 1.d4'] as const;
  return (
    <div className="page narrow openings">
      <PageHead title="Openings" back="/learn" />
      <p className="muted" style={{ marginTop: -8 }}>
        Pick the openings you play. Each one is a set of lines, with one move for you in every position and the replies you’ll meet. Drill them until
        they’re automatic: a line comes back sooner when you miss a move, and your game reviews tell you where you left your preparation.
      </p>
      {groups.map((g) => (
        <section key={g}>
          <SectionTitle>{g}</SectionTitle>
          <div className="list">
            {REPERTOIRE_PACKS.filter((p) => p.group === g).map((p) => {
              const ls = lines?.get(p.id) ?? [];
              const learnt = ls.filter((l) => (progress[l.id]?.box ?? 0) >= LEARNT_BOX).length;
              const due = ls.filter((l) => progress[l.id] && progress[l.id].due <= Date.now()).length;
              const mine = selected.includes(p.id);
              return (
                <div key={p.id} className="opening-row">
                  <button className="or-main" onClick={() => navigate(`/openings/${p.id}`)}>
                    <span className="or-name">{p.name}</span>
                    <span className="or-sub">
                      <Moves line={formatLine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', p.root.split(' '))} />
                    </span>
                    <span className="or-blurb">{p.blurb}</span>
                    {ls.length > 0 && (
                      <span className="or-stats">
                        {learnt}/{ls.length} lines learnt{due ? ` · ${due} due` : ''}
                      </span>
                    )}
                  </button>
                  <Toggle checked={mine} onChange={() => toggle(p.id)} label={<span className="sr-only">In my repertoire</span>} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {!lines && <p className="faint">Loading openings…</p>}
    </div>
  );
}

/** The next line to drill: due ones first, then new ones, in tree order. */
function pickLine(ls: RepLine[], progress: Record<string, LineProgress>, skip?: string): RepLine | null {
  const now = Date.now();
  const due = ls.filter((l) => progress[l.id] && progress[l.id].due <= now && l.id !== skip);
  if (due.length) return due.sort((a, b) => progress[a.id].due - progress[b.id].due)[0];
  const fresh = ls.find((l) => !progress[l.id] && l.id !== skip);
  if (fresh) return fresh;
  const later = ls.filter((l) => l.id !== skip).sort((a, b) => (progress[a.id]?.due ?? 0) - (progress[b.id]?.due ?? 0));
  return later[0] ?? null;
}

/** `#/openings/<id>`: drill one opening, line by line. */
export function OpeningDrill({ id }: { id: string }) {
  const pack = findPack(id);
  const lines = usePackLines();
  const { grade, selected, toggle } = useRepertoire();
  const [line, setLine] = useState<RepLine | null>(null);
  const [ply, setPly] = useState(0);
  const [missed, setMissed] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [result, setResult] = useState<LineProgress | null>(null);
  /** A line you haven't seen yet is shown first: an arrow marks each of your moves. */
  const [learning, setLearning] = useState(false);
  useEffect(() => void loadOpeningBook(), []);

  const ls = useMemo(() => (pack && lines?.get(pack.id)) || [], [pack, lines]);
  const start = (l: RepLine | null) => {
    setLine(l);
    setLearning(!!l && !useRepertoire.getState().lines[l.id]);
  };
  useEffect(() => {
    if (!line && ls.length) start(pickLine(ls, useRepertoire.getState().lines));
  }, [ls, line]); // eslint-disable-line react-hooks/exhaustive-deps

  const you = pack?.color ?? 'w';
  const chess = useMemo(() => {
    const c = new Chess();
    for (const u of line?.moves.slice(0, ply) ?? []) playUci(c, u);
    return c;
  }, [line, ply]);
  const done = !!line && ply >= line.moves.length;
  const yourTurn = !!line && !done && chess.turn() === you;

  // The other side's moves play themselves.
  useEffect(() => {
    if (!line || done || yourTurn) return;
    const t = setTimeout(
      () => {
        const c = new Chess(chess.fen());
        const m = playUci(c, line.moves[ply]);
        if (m) playSound(soundForSan(m.san));
        setPly((p) => p + 1);
      },
      ply === 0 ? 500 : 450,
    );
    return () => clearTimeout(t);
  }, [line, ply, done, yourTurn, chess]);

  // Grade the line once it ends.
  useEffect(() => {
    if (done && line && !result) setResult(grade(line.id, !missed));
  }, [done, line, missed, result, grade]);

  if (!pack) return null;

  const next = () => {
    start(pickLine(ls, useRepertoire.getState().lines, line?.id));
    setPly(0);
    setMissed(false);
    setWrong(null);
    setResult(null);
  };

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!line || !yourTurn) return;
    const uci = from + to + (promotion ?? '');
    if (uci === line.moves[ply] || (from + to === line.moves[ply].slice(0, 4) && !line.moves[ply][4])) {
      playSound(soundForSan(line.sans[ply]));
      setWrong(null);
      setPly((p) => p + 1);
    } else {
      playSound('illegal');
      setMissed(true);
      setWrong(line.moves[ply]);
    }
  };

  const shown = wrong ?? (learning && yourTurn && line ? line.moves[ply] : null);
  const shapes: DrawShape[] = shown ? [{ orig: shown.slice(0, 2) as Key, dest: shown.slice(2, 4) as Key, brush: wrong ? 'green' : 'blue' }] : [];
  const last = ply > 0 ? line?.moves[ply - 1] : undefined;
  const name = getOpeningBook()?.classify([chess.fen()])?.name ?? getOpeningBook()?.nameOf(chess.fen())?.name;
  const lineIndex = line ? ls.findIndex((l) => l.id === line.id) + 1 : 0;
  const mine = selected.includes(pack.id);

  return (
    <div className="game-layout focus-screen lesson-screen">
      <div className="board-column">
        <div className="player-bar lesson-top">
          <button className="icon-btn" onClick={() => navigate('/openings')} aria-label="Close">
            <X size={22} />
          </button>
          <b>{pack.name}</b>
          <span className="spacer" />
          {ls.length > 0 && (
            <span className="faint">
              line {lineIndex}/{ls.length}
            </span>
          )}
        </div>
        <div className="board-row">
          <Board
            fen={chess.fen()}
            orientation={you === 'w' ? 'white' : 'black'}
            movableColor={yourTurn ? (you === 'w' ? 'white' : 'black') : undefined}
            dests={yourTurn ? legalDests(chess) : undefined}
            lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
            check={chess.inCheck()}
            shapes={shapes}
            onMove={onMove}
            viewOnly={!yourTurn}
          />
        </div>
      </div>
      <div className="side-panel">
        <div className="panel-body">
          {!line ? (
            <p className="faint">{lines ? 'This opening has no lines yet.' : 'Loading…'}</p>
          ) : (
            <div className={`coach-card ${done ? (missed ? '' : 'good') : wrong ? 'bad' : ''}`}>
              <span className="coach-step">{name ?? pack.name}</span>
              <h3 className="coach-title">
                <Accent
                  text={done ? (missed ? 'Line *done*' : learning ? 'New line *seen*.' : 'Line *learnt*.') : yourTurn ? 'Your *move*' : 'Their move…'}
                />
              </h3>
              {wrong && !done && (
                <p className="coach-text wrong-text">
                  Not in your repertoire. Here you play <San san={line.sans[ply]} chip />. Play it to carry on.
                </p>
              )}
              {!wrong && !done && (
                <p className="coach-text">
                  {learning && yourTurn ? (
                    <>
                      New line: play <San san={line.sans[ply]} chip />, the move shown.
                    </>
                  ) : ply < line.rootLength ? (
                    'The opening’s starting moves.'
                  ) : (
                    'Play the move from your repertoire.'
                  )}
                </p>
              )}
              {done && result && (
                <p className="coach-text">
                  {missed
                    ? 'You missed a move, so this line comes back soon.'
                    : learning
                      ? `That’s the line. It comes back ${nextReviewText(result)} to check you remember it.`
                      : `Clean run. This line comes back ${nextReviewText(result)}.`}
                </p>
              )}
              <p className="coach-line moves-line">
                <Moves line={formatLine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', line.sans.slice(0, ply))} />
              </p>
              {!mine && (
                <button className="btn small" onClick={() => toggle(pack.id)}>
                  <Check size={14} /> Add to my repertoire
                </button>
              )}
            </div>
          )}
        </div>
        <div className="play-controls">
          <button
            className="ctl"
            onClick={() => {
              setPly(0);
              setWrong(null);
              setMissed(false);
              setResult(null);
            }}
            disabled={!line}
          >
            <span className="ctl-ico">
              <RotateCcw size={20} />
            </span>
            <span className="ctl-label">Restart</span>
          </button>
          <button className={`ctl wide ${done ? 'go' : ''}`} onClick={next} disabled={!ls.length}>
            <span className="ctl-ico">
              <ChevronRight size={22} />
            </span>
            <span className="ctl-label">{done ? 'Next line' : 'Skip line'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const moveLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}${san}`;

/** In a game review: where the game left one of your repertoire openings. */
export function RepertoireNote({ moves, sans, you }: { moves: string[]; sans: string[]; you?: 'w' | 'b' }) {
  const selected = useRepertoire((s) => s.selected);
  const [trees, setTrees] = useState<Map<string, PackTree> | null>(null);
  useEffect(() => {
    void loadRepertoires().then(setTrees);
  }, []);
  if (!trees || !you) return null;
  for (const id of selected) {
    const pack = findPack(id);
    const tree = trees.get(id);
    if (!pack || !tree) continue;
    const d = deviation(pack, tree.tree, rootOf(pack).moves, moves, sans, you);
    if (!d) continue;
    return (
      <div className="rep-note">
        <span className="coach-label">Your repertoire · {pack.name}</span>
        <p className="coach-text">
          {d.kind === 'you' ? (
            <Rich text={`You left your line with ${moveLabel(d.ply, d.played)}. Your move there is ${moveLabel(d.ply, d.expected)}.`} />
          ) : d.kind === 'them' ? (
            <Rich text={`Your opponent left your line with ${moveLabel(d.ply, d.played)}. From there you were on your own.`} />
          ) : (
            <Rich text={`You followed your line to the end, move ${Math.floor(d.ply / 2) + 1}.`} />
          )}
        </p>
        {d.kind === 'you' && (
          <button className="btn small" onClick={() => navigate(`/openings/${pack.id}`)}>
            Drill the {pack.name}
          </button>
        )}
      </div>
    );
  }
  return null;
}
