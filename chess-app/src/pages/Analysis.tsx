import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board, type BoardHandle, type PromotionPiece } from '../components/Board';
import { EvalBar, Modal, Segmented, Toggle, toast } from '../components/Widgets';
import { getAnalysisEngine } from '../lib/engine/manager';
import { formatScore, type PvLine, type Score } from '../lib/engine/uci';
import { loadOpeningBook, type Opening } from '../lib/chess/openings';
import {
  NAG_SYMBOLS,
  addMove,
  deleteNode,
  emptyTree,
  mainline,
  mainlineMoves,
  parsePgn,
  pathTo,
  promoteVariation,
  setComment,
  treeFromMoves,
  writePgn,
  type GameTree,
  type TreeNode,
} from '../lib/chess/pgn';
import { START_FEN, formatLine, legalDests, sanLine, validateFen } from '../lib/chess/utils';
import { flipTurn } from '../lib/chess/tactics';
import { describeThreat } from '../lib/review/explain';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { getGame, newId, saveGame, type GameRecord } from '../lib/storage/db';
import { useSettings } from '../state/settings';
import { copyText, saveTextFile } from '../lib/platform';
import { San } from '../components/Rich';

const LS_KEY = 'outpost.analysis';

function loadSaved(): { tree: GameTree; cur: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d?.tree?.nodes?.[d.tree.rootId]) return d;
  } catch {
    /* ignore */
  }
  return null;
}

interface EngineState {
  lines: PvLine[];
  depth: number;
  nps?: number;
  fen: string;
}

export function AnalysisPage({ query }: { query: URLSearchParams }) {
  const settings = useSettings();
  const [tree, setTree] = useState<GameTree>(() => loadSaved()?.tree ?? emptyTree());
  const [cur, setCur] = useState<string>(() => loadSaved()?.cur ?? 'root');
  const [flipped, setFlipped] = useState(false);
  const [engineOn, setEngineOn] = useState(true);
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [threatOn, setThreatOn] = useState(false);
  const [threat, setThreat] = useState<{ fen: string; line: PvLine } | null>(null);
  const [modal, setModal] = useState<'import' | 'export' | 'editor' | 'comment' | null>(null);
  const [sourceGame, setSourceGame] = useState<GameRecord | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const boardRef = useRef<BoardHandle>(null);
  const multipv = settings.analysisLines;

  // Load from ?game=, ?fen= or ?pgn= (via sessionStorage).
  useEffect(() => {
    const gameId = query.get('game');
    const fen = query.get('fen');
    const pgnKey = query.get('pgn');
    if (gameId) {
      void getGame(gameId).then((g) => {
        if (!g) return toast('Game not found');
        setSourceGame(g);
        const parsed = parsePgn(g.pgn)[0];
        const t = parsed && parsed.errors.length === 0 ? parsed.tree : treeFromMoves(g.startFen, g.moves);
        setTree(t);
        const line = mainline(t);
        const ply = +(query.get('ply') ?? 0);
        setCur(ply > 0 && line[ply - 1] ? line[ply - 1].id : t.rootId);
        setFlipped(g.userColor === 'b');
      });
    } else if (fen) {
      const err = validateFen(fen);
      if (err) toast(err);
      else {
        setTree(emptyTree(new Chess(fen).fen()));
        setCur('root');
      }
    } else if (pgnKey) {
      const text = sessionStorage.getItem(pgnKey);
      if (text) loadPgnText(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the board (only for free analysis, not when viewing a saved game).
  useEffect(() => {
    if (sourceGame) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ tree, cur }));
    } catch {
      /* quota */
    }
  }, [tree, cur, sourceGame]);

  const node = tree.nodes[cur] ?? tree.nodes[tree.rootId];
  const chess = useMemo(() => new Chess(node.fen), [node.fen]);
  const path = useMemo(() => pathTo(tree, node.id), [tree, node.id]);

  useEffect(() => {
    void loadOpeningBook().then((book) => {
      if (!book) return;
      const fens = [tree.nodes[tree.rootId].fen, ...path.map((n) => n.fen)];
      setOpening(book.classify(fens));
    });
  }, [path, tree]);

  // Engine analysis of the current position.
  useEffect(() => {
    if (!engineOn || chess.isGameOver()) {
      setEngine(null);
      return;
    }
    const e = getAnalysisEngine({ threads: settings.engineThreads, hash: settings.engineHash });
    const fen = node.fen;
    setEngine({ lines: [], depth: 0, fen });
    let last = 0;
    let alive = true;
    const h = e.search({
      fen: tree.nodes[tree.rootId].fen,
      moves: path.map((n) => n.uci!),
      limits: { infinite: true },
      multipv,
      onInfo: (lines, depth) => {
        if (!alive) return;
        const now = performance.now();
        if (now - last < 120 && depth < 12) return;
        last = now;
        setEngine({ lines, depth, nps: lines[0]?.nps, fen });
      },
    });
    // Stop deep searches after a while to save battery.
    const timer = setTimeout(() => h.stop(), 60000);
    return () => {
      alive = false;
      clearTimeout(timer);
      h.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.fen, engineOn, multipv, settings.engineThreads, settings.engineHash]);

  // Threat: what would the opponent do if it were their move?
  useEffect(() => {
    setThreat(null);
    if (!threatOn || chess.inCheck() || chess.isGameOver()) return;
    const flipped = flipTurn(chess);
    if (!flipped) return;
    const fen = flipped.fen();
    let alive = true;
    void getAnalysisEngine({ threads: settings.engineThreads, hash: settings.engineHash })
      .analyse({ fen, limits: { depth: 14, movetime: 2500 } })
      .then((r) => alive && r.lines[0] && setThreat({ fen, line: r.lines[0] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.fen, threatOn]);

  const goTo = useCallback((id: string) => setCur(id), []);

  const playLine = useCallback(
    (moves: string[]) => {
      let t = tree;
      let id = cur;
      let san = '';
      for (const u of moves) {
        const r = addMove(t, id, u);
        if (!r) break;
        t = r.tree;
        id = r.id;
        san = t.nodes[id].san ?? '';
      }
      if (id === cur) return;
      playSound(soundForSan(san));
      setTree(t);
      setCur(id);
    },
    [tree, cur],
  );
  const playMove = useCallback((uci: string) => playLine([uci]), [playLine]);

  const onBoardMove = useCallback((from: string, to: string, promotion?: PromotionPiece) => playMove(from + to + (promotion ?? '')), [playMove]);

  function loadPgnText(text: string): boolean {
    const games = parsePgn(text);
    const g = games[0];
    if (!g || !g.tree.nodes[g.tree.rootId].children.length) {
      // Maybe it's a FEN.
      const fenErr = validateFen(text.trim());
      if (!fenErr) {
        setTree(emptyTree(new Chess(text.trim()).fen()));
        setCur('root');
        setSourceGame(null);
        return true;
      }
      toast('Could not read that PGN or FEN');
      return false;
    }
    if (g.errors.length) toast(g.errors[0]);
    setTree({ ...g.tree, headers: { ...g.headers, Result: g.result } });
    setCur(g.tree.rootId);
    setSourceGame(null);
    return true;
  }

  // Keyboard.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || modal) return;
      if (e.key === 'ArrowLeft') node.parentId && setCur(node.parentId);
      else if (e.key === 'ArrowRight') node.children[0] && setCur(node.children[0]);
      else if (e.key === 'ArrowUp') setCur(tree.rootId);
      else if (e.key === 'ArrowDown') {
        let n = node;
        while (n.children[0]) n = tree.nodes[n.children[0]];
        setCur(n.id);
      } else if (e.key === 'f') setFlipped((f) => !f);
      else if (e.key === ' ') {
        const best = engine?.lines[0]?.pv[0];
        if (best) playMove(best);
      } else if (e.key === 'e') setEngineOn((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [node, tree, modal, engine, playMove]);

  const dests = useMemo(() => legalDests(chess), [chess]);
  const lastMove = node.uci ? ([node.uci.slice(0, 2), node.uci.slice(2, 4)] as [string, string]) : undefined;

  const shapes = useMemo<DrawShape[]>(() => {
    const out: DrawShape[] = [];
    if (settings.showArrows && engine && engine.fen === node.fen) {
      engine.lines.forEach((l, i) => {
        const u = l.pv[0];
        if (!u) return;
        out.push({
          orig: u.slice(0, 2) as Key,
          dest: u.slice(2, 4) as Key,
          brush: i === 0 ? 'paleBlue' : 'paleGrey',
          modifiers: { lineWidth: i === 0 ? 12 : 7 },
        });
      });
    }
    if (threat && threatOn) {
      const u = threat.line.pv[0];
      if (u) out.push({ orig: u.slice(0, 2) as Key, dest: u.slice(2, 4) as Key, brush: 'red' });
    }
    return out;
  }, [engine, node.fen, settings.showArrows, threat, threatOn]);

  const score: Score | undefined = engine && engine.fen === node.fen ? engine.lines[0]?.score : undefined;
  const orientation = flipped ? 'black' : 'white';

  const reviewThis = async () => {
    const { startFen, moves, sans } = mainlineMoves(tree);
    if (!moves.length) return toast('Play or import some moves first');
    if (sourceGame && sourceGame.moves.join() === moves.join()) return navigate(`/review/${sourceGame.id}`);
    const h = tree.headers;
    const rec: GameRecord = {
      id: newId(),
      createdAt: Date.now(),
      source: 'analysis',
      white: { name: h.White && h.White !== '?' ? h.White : 'White', elo: +h.WhiteElo || undefined },
      black: { name: h.Black && h.Black !== '?' ? h.Black : 'Black', elo: +h.BlackElo || undefined },
      result: (['1-0', '0-1', '1/2-1/2'].includes(h.Result) ? h.Result : '*') as GameRecord['result'],
      startFen,
      moves,
      sans,
      pgn: writePgn(tree, { variations: false }),
      date: h.Date,
      opening: opening?.name,
    };
    await saveGame(rec);
    navigate(`/review/${rec.id}`);
  };

  const pgnText = useMemo(() => (modal === 'export' ? writePgn(tree) : ''), [modal, tree]);

  return (
    <div className="game-layout">
      <div className="board-column with-evalbar">
        <div className="player-bar" style={{ minHeight: 30 }}>
          <b>{(flipped ? tree.headers.White : tree.headers.Black) || (flipped ? 'White' : 'Black')}</b>
          <span className="spacer" />
          {opening && (
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {opening.eco} · {opening.name}
            </span>
          )}
        </div>
        <div className="board-row">
          <EvalBar score={score} flipped={flipped} mateLabel={chess.isCheckmate() ? '#' : undefined} />
          <Board
            ref={boardRef}
            fen={node.fen}
            orientation={orientation}
            movableColor={chess.turn() === 'w' ? 'white' : 'black'}
            dests={dests}
            lastMove={lastMove}
            check={chess.inCheck()}
            shapes={shapes}
            onMove={onBoardMove}
          />
        </div>
        <div className="player-bar" style={{ minHeight: 30 }}>
          <b>{(flipped ? tree.headers.Black : tree.headers.White) || (flipped ? 'Black' : 'White')}</b>
          <span className="spacer" />
          <span className="faint only-desktop" style={{ fontSize: '0.8rem' }}>
            <span className="kbd">←</span> <span className="kbd">→</span> navigate · <span className="kbd">space</span> best move ·{' '}
            <span className="kbd">f</span> flip
          </span>
        </div>
      </div>

      <div className="side-panel">
        <div className="engine-head">
          <Toggle checked={engineOn} onChange={setEngineOn} />
          <b style={{ fontSize: '1.05rem', minWidth: 54 }}>{engineOn && score ? formatScore(score) : chess.isCheckmate() ? '#' : '–'}</b>
          <span className="faint">
            {engineOn
              ? engine?.depth
                ? `depth ${engine.depth}${engine.nps ? ` · ${Math.round(engine.nps / 1000)} kn/s` : ''}`
                : 'starting…'
              : 'engine off'}
          </span>
          <span className="spacer" />
          <Segmented
            value={multipv}
            onChange={(v) => settings.set({ analysisLines: v })}
            options={[1, 2, 3, 5].map((n) => ({ value: n, label: n }))}
          />
        </div>
        {engineOn && engine && (
          <div className="engine-lines">
            {engine.lines.map((l) => (
              <EngineLineView key={l.multipv} line={l} fen={engine.fen} onPlay={playLine} />
            ))}
          </div>
        )}
        {threatOn && threat && (
          <div className="engine-line" style={{ background: '#3a2422' }}>
            <span className="score neg">Threat</span>
            <span className="pv">
              {describeThreat(node.fen, threat.line.pv)} · {formatLine(threat.fen, sanLine(threat.fen, threat.line.pv, 6))}
            </span>
          </div>
        )}

        <div className="panel-body">
          <TreeView tree={tree} cur={node.id} onSelect={goTo} />
          {node.comment && (
            <div className="card" style={{ marginTop: 10, background: 'var(--panel-2)', padding: 10, fontSize: '0.9rem' }}>
              {node.comment}
            </div>
          )}
        </div>

        <div className="panel-foot">
          <button className="icon-btn" title="Start (↑)" onClick={() => setCur(tree.rootId)}>
            <ChevronsLeft size={18} />
          </button>
          <button className="icon-btn" title="Back (←)" onClick={() => node.parentId && setCur(node.parentId)}>
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" title="Forward (→)" onClick={() => node.children[0] && setCur(node.children[0])}>
            <ChevronRight size={18} />
          </button>
          <button
            className="icon-btn"
            title="End (↓)"
            onClick={() => {
              let n = node;
              while (n.children[0]) n = tree.nodes[n.children[0]];
              setCur(n.id);
            }}
          >
            <ChevronsRight size={18} />
          </button>
          <button className="icon-btn" title="Flip (f)" onClick={() => setFlipped((f) => !f)}>
            <ArrowUpDown size={18} />
          </button>
          <span className="spacer" />
          <button className="btn small primary" onClick={reviewThis} title="Full game review of the main line">
            Review
          </button>
          <button className="btn small" onClick={() => setModal('import')}>
            Load
          </button>
          <button className="btn small" onClick={() => setModal('export')}>
            Export
          </button>
          <MoreMenu
            items={[
              { label: threatOn ? 'Hide threat' : 'Show threat', run: () => setThreatOn((v) => !v) },
              { label: 'Set up position', run: () => setModal('editor') },
              { label: 'Comment on move', run: () => setModal('comment'), disabled: node.id === tree.rootId },
              {
                label: 'Promote variation',
                run: () => setTree((t) => promoteVariation(t, node.id)),
                disabled: !node.parentId,
              },
              {
                label: 'Delete from here',
                run: () => {
                  const parent = node.parentId;
                  if (!parent) return;
                  setTree((t) => deleteNode(t, node.id));
                  setCur(parent);
                },
                disabled: !node.parentId,
              },
              {
                label: 'New board',
                run: () => {
                  setTree(emptyTree());
                  setCur('root');
                  setSourceGame(null);
                },
              },
              {
                label: 'Copy FEN',
                run: () =>
                  void copyText(node.fen).then(
                    () => toast('FEN copied'),
                    () => toast('Copy failed'),
                  ),
              },
              { label: 'Play from here vs bot', run: () => navigate(`/play?fen=${encodeURIComponent(node.fen)}`) },
            ]}
          />
        </div>
      </div>

      {modal === 'import' && (
        <ImportModal
          onClose={() => setModal(null)}
          onLoad={(text) => {
            if (loadPgnText(text)) setModal(null);
          }}
        />
      )}
      {modal === 'export' && (
        <Modal onClose={() => setModal(null)} wide>
          <h2>Export</h2>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            FEN
          </div>
          <input readOnly value={node.fen} style={{ width: '100%', marginBottom: 12 }} onFocus={(e) => e.target.select()} />
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            PGN (with variations and comments)
          </div>
          <textarea readOnly rows={12} value={pgnText} onFocus={(e) => e.target.select()} />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              className="btn"
              onClick={() =>
                void copyText(pgnText).then(
                  () => toast('PGN copied'),
                  () => toast('Copy failed'),
                )
              }
            >
              Copy PGN
            </button>
            <button
              className="btn primary"
              onClick={() => {
                try {
                  const where = saveTextFile('analysis.pgn', 'application/x-chess-pgn', pgnText);
                  if (where) toast(`Saved to ${where}`);
                } catch {
                  toast('Could not save the file');
                }
              }}
            >
              Download .pgn
            </button>
          </div>
        </Modal>
      )}
      {modal === 'editor' && (
        <PositionEditor
          initialFen={node.fen}
          onClose={() => setModal(null)}
          onApply={(fen) => {
            setTree(emptyTree(fen));
            setCur('root');
            setSourceGame(null);
            setModal(null);
          }}
        />
      )}
      {modal === 'comment' && (
        <CommentModal
          initial={node.comment ?? ''}
          onClose={() => setModal(null)}
          onSave={(text) => {
            setTree((t) => setComment(t, node.id, text));
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function EngineLineView({ line, fen, onPlay }: { line: PvLine; fen: string; onPlay: (moves: string[]) => void }) {
  const sans = useMemo(() => sanLine(fen, line.pv, 14), [fen, line.pv]);
  const tokens = formatLine(fen, sans).split(' ');
  let ply = -1;
  const neg = line.score.type === 'mate' ? line.score.value < 0 : line.score.value < 0;
  return (
    <div className="engine-line">
      <span className={`score ${neg ? 'neg' : ''}`}>{formatScore(line.score)}</span>
      <span className="pv">
        {tokens.map((t, i) => {
          if (/^\d+\.+$/.test(t))
            return (
              <b key={i} className="faint">
                {t}{' '}
              </b>
            );
          ply++;
          const upto = ply;
          return (
            <span key={i} onClick={() => onPlay(line.pv.slice(0, upto + 1))}>
              {t}{' '}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function TreeView({ tree, cur, onSelect }: { tree: GameTree; cur: string; onSelect: (id: string) => void }) {
  const root = tree.nodes[tree.rootId];
  if (!root.children.length) return <div className="faint">Make a move on the board, or load a PGN / FEN.</div>;
  const moveSpan = (n: TreeNode, forceNumber: boolean) => {
    const white = n.ply % 2 === 1;
    const num = Math.floor((n.ply - 1) / 2) + 1;
    return (
      <span key={n.id}>
        {(white || forceNumber) && <span className="num">{white ? `${num}.` : `${num}...`}</span>}
        <span className={`mv ${n.id === cur ? 'cur' : ''}`} onClick={() => onSelect(n.id)} data-id={n.id}>
          <San san={n.san ?? ''} />
          {n.nags?.map((g) => (
            <span key={g} className="nag">
              {NAG_SYMBOLS[g] ?? ''}
            </span>
          ))}
        </span>{' '}
      </span>
    );
  };
  const renderLine = (startId: string, depth: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let id: string | undefined = startId;
    let force = true;
    let guard = 0;
    while (id && guard++ < 2000) {
      const n: TreeNode = tree.nodes[id];
      out.push(moveSpan(n, force));
      force = false;
      if (n.comment) {
        out.push(
          <span key={n.id + 'c'} className="comment">
            {n.comment}
          </span>,
        );
        force = true;
      }
      const parent = tree.nodes[n.parentId!];
      if (parent.children[0] === id && parent.children.length > 1) {
        for (const alt of parent.children.slice(1)) {
          out.push(
            <span key={alt + 'v'} className="variation">
              {depth > 6 ? <span className="faint">…</span> : renderLine(alt, depth + 1)}
            </span>,
          );
        }
        force = true;
      }
      id = n.children[0];
    }
    return out;
  };
  return (
    <div className="tree">
      {root.comment && <span className="comment">{root.comment}</span>}
      {renderLine(root.children[0], 0)}
      {tree.headers.Result && tree.headers.Result !== '*' && <b className="muted"> {tree.headers.Result}</b>}
    </div>
  );
}

function MoreMenu({ items }: { items: { label: string; run: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn small" onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div className="card" style={{ position: 'absolute', right: 0, bottom: '110%', zIndex: 31, padding: 6, minWidth: 200 }}>
            {items.map((it) => (
              <button
                key={it.label}
                className="btn ghost small"
                style={{ display: 'flex', width: '100%', justifyContent: 'flex-start' }}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.run();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ImportModal({ onClose, onLoad }: { onClose: () => void; onLoad: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal onClose={onClose} wide>
      <h2>Load PGN or FEN</h2>
      <textarea
        rows={12}
        autoFocus
        placeholder="Paste a PGN (variations and comments are kept) or a FEN"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <label className="btn small">
          Open .pgn file
          <input
            type="file"
            accept=".pgn,.txt"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
        </label>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onLoad(text)} disabled={!text.trim()}>
          Load
        </button>
      </div>
    </Modal>
  );
}

function CommentModal({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Modal onClose={onClose}>
      <h2>Comment</h2>
      <textarea rows={4} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onSave(text.trim())}>
          Save
        </button>
      </div>
    </Modal>
  );
}

const SPARE: { role: string; letter: string }[] = [
  { role: 'king', letter: 'k' },
  { role: 'queen', letter: 'q' },
  { role: 'rook', letter: 'r' },
  { role: 'bishop', letter: 'b' },
  { role: 'knight', letter: 'n' },
  { role: 'pawn', letter: 'p' },
];

function PositionEditor({ initialFen, onClose, onApply }: { initialFen: string; onClose: () => void; onApply: (fen: string) => void }) {
  const parts = initialFen.split(' ');
  const [boardFen, setBoardFen] = useState(parts[0]);
  const [turn, setTurn] = useState<'w' | 'b'>(parts[1] === 'b' ? 'b' : 'w');
  const [castling, setCastling] = useState(parts[2] ?? 'KQkq');
  const ref = useRef<BoardHandle>(null);
  const fen = `${boardFen} ${turn} ${castling || '-'} - 0 1`;
  const error = validateFen(fen);
  const toggleCastle = (c: string) => {
    const set = new Set((castling === '-' ? '' : castling).split(''));
    if (set.has(c)) set.delete(c);
    else set.add(c);
    setCastling(['K', 'Q', 'k', 'q'].filter((x) => set.has(x)).join('') || '-');
  };
  const spare = (color: 'white' | 'black') => (
    <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
      {SPARE.map((s) => (
        <div
          key={s.role}
          style={{ width: 40, height: 40, cursor: 'grab', touchAction: 'none' }}
          onMouseDown={(e) => ref.current?.api()?.dragNewPiece({ role: s.role as never, color }, e.nativeEvent as never, true)}
          onTouchStart={(e) => ref.current?.api()?.dragNewPiece({ role: s.role as never, color }, e.nativeEvent as never, true)}
        >
          <piece className={`${color} ${s.role}`} style={{ display: 'block', width: 40, height: 40, backgroundSize: 'cover' }} />
        </div>
      ))}
    </div>
  );
  return (
    <Modal onClose={onClose} wide>
      <h2>Set up position</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 360px) 1fr', gap: 16 }} className="editor-grid">
        <div>
          {spare('black')}
          <div style={{ margin: '6px 0' }}>
            <Board ref={ref} fen={`${boardFen} w - - 0 1`} orientation="white" free onChange={(f) => setBoardFen(f)} />
          </div>
          {spare('white')}
          <div className="faint" style={{ fontSize: '0.78rem', textAlign: 'center', marginTop: 4 }}>
            Drag pieces onto the board; drag them off to remove.
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Segmented
            value={turn}
            onChange={setTurn}
            options={[
              { value: 'w', label: 'White to move' },
              { value: 'b', label: 'Black to move' },
            ]}
          />
          <div>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              Castling
            </div>
            <div className="row">
              {['K', 'Q', 'k', 'q'].map((c) => (
                <Toggle
                  key={c}
                  checked={castling.includes(c)}
                  onChange={() => toggleCastle(c)}
                  label={`${c === c.toUpperCase() ? 'White' : 'Black'} O-O${c.toLowerCase() === 'q' ? '-O' : ''}`}
                />
              ))}
            </div>
          </div>
          <div className="row">
            <button className="btn small" onClick={() => setBoardFen(START_FEN.split(' ')[0])}>
              Start position
            </button>
            <button className="btn small" onClick={() => setBoardFen('8/8/8/8/8/8/8/8')}>
              Clear board
            </button>
          </div>
          <input value={fen} readOnly onFocus={(e) => e.target.select()} />
          {error && <div className="error-box">{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!!error} onClick={() => onApply(new Chess(fen).fen())}>
              Analyse position
            </button>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 700px) { .editor-grid { grid-template-columns: 1fr !important; } }`}</style>
    </Modal>
  );
}
