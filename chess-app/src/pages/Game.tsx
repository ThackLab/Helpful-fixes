import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyseLive, pauseLive } from '../state/liveAnalysis';
import { monogram } from '../lib/bots/bots';
import { ArrowUpDown, ChevronLeft, ChevronRight, Flag, Handshake, Lightbulb, Microscope, Plus, RotateCcw, Undo2 } from 'lucide-react';
import type { DrawShape } from 'chessground/draw';
import { Board, type BoardHandle, type PromotionPiece } from '../components/Board';
import { EvalBar, Modal, PlayerBar, formatClock, toast } from '../components/Widgets';
import { MoveList, MoveStrip } from '../components/MoveList';
import { botAcceptsDraw, chooseBotMove, thinkTime } from '../lib/bots/brain';
import { getAnalysisEngine, getBotEngine } from '../lib/engine/manager';
import { scoreToCp, type Score } from '../lib/engine/uci';
import { getOpeningBook, loadOpeningBook } from '../lib/chess/openings';
import { legalDests } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { canMate, chessOf, liveBot, useLiveGame, type LiveGame } from '../state/game';
import { useReviewer } from '../state/reviewer';
import { useSettings } from '../state/settings';
import { useProfile } from '../state/profile';
import { CLASS_META } from '../lib/review/types';
import { getReview } from '../lib/storage/db';

const colorName = (c: 'w' | 'b') => (c === 'w' ? 'white' : 'black');

function ClockView({ game, color }: { game: LiveGame; color: 'w' | 'b' }) {
  const [, force] = useState(0);
  const chess = useMemo(() => chessOf(game), [game]);
  const running = game.status === 'playing' && chess.turn() === color && game.moves.length >= 2 && !!game.turnStartedAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [running]);
  if (!game.timeControl) return null;
  const left = running ? game.clocks[color] - (Date.now() - game.turnStartedAt!) : game.clocks[color];
  return <div className={`clock ${color === 'b' ? 'dark' : ''} ${running ? 'active' : ''} ${left < 20000 ? 'low' : ''}`}>{formatClock(left)}</div>;
}

export function GamePage() {
  const game = useLiveGame((s) => s.game);
  const store = useLiveGame;
  const settings = useSettings();
  const rating = useProfile((s) => s.rating);
  const boardRef = useRef<BoardHandle>(null);
  const [flipped, setFlipped] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [hint, setHint] = useState<{ ply: number; uci: string } | null>(null);
  const [lastEval, setLastEval] = useState<Score | undefined>();
  const [showEnd, setShowEnd] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const reviewJob = useReviewer((s) => (game?.savedId ? s.jobs[game.savedId] : undefined));

  useEffect(() => {
    void loadOpeningBook();
    getBotEngine();
  }, []);

  const chess = useMemo(() => (game ? chessOf(game) : null), [game]);
  const bot = game ? liveBot(game) : null;

  // Bot moves.
  useEffect(() => {
    if (!game || !chess || !bot || game.status !== 'playing' || chess.turn() === game.userColor) return;
    let cancelled = false;
    const key = `${game.id}:${game.moves.length}`;
    const started = Date.now();
    (async () => {
      try {
        const engine = getBotEngine();
        const mv = await chooseBotMove(engine, { startFen: game.startFen, moves: game.moves, bot, book: getOpeningBook() });
        const cur = store.getState().game;
        const clockLeft = cur?.timeControl ? cur.clocks[chess.turn()] : undefined;
        const wait = thinkTime(bot.elo, game.moves.length, Math.random, clockLeft) - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const now = store.getState().game;
        if (cancelled || !now || `${now.id}:${now.moves.length}` !== key || now.status !== 'playing') return;
        if (mv.score) setLastEval(mv.score);
        if (store.getState().applyMove(mv.uci)) {
          playSound(soundForSan(mv.san));
          const after = store.getState().game;
          if (after?.status === 'playing') requestAnimationFrame(() => boardRef.current?.playPremove());
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game?.id, game?.moves.length, game?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flag fall.
  useEffect(() => {
    if (!game?.timeControl || game.status !== 'playing') return;
    const id = setInterval(() => {
      const g = store.getState().game;
      if (!g || g.status !== 'playing' || !g.timeControl || !g.turnStartedAt || g.moves.length < 2) return;
      const c = chessOf(g);
      const turn = c.turn();
      if (g.clocks[turn] - (Date.now() - g.turnStartedAt) <= 0) {
        const winner = turn === 'w' ? 'b' : 'w';
        const result = canMate(c, winner) ? (winner === 'w' ? '1-0' : '0-1') : '1/2-1/2';
        store.getState().finish(result, result === '1/2-1/2' ? 'timeout vs insufficient material' : 'timeout');
      }
    }, 100);
    return () => clearInterval(id);
  }, [game?.id, game?.status, game?.timeControl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Game end: sound and the result dialog (the review starts automatically below).
  const prevStatus = useRef(game?.status);
  useEffect(() => {
    if (!game || !bot) return;
    if (prevStatus.current === 'playing' && game.status === 'over') {
      playSound('end');
      setShowEnd(true);
      setViewPly(null);
    }
    prevStatus.current = game.status;
  }, [game?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Review in the background while the game is played, so the review after it is quick.
  useEffect(() => {
    if (game?.status === 'playing' && settings.autoReview && settings.liveAnalysis) analyseLive(game.startFen, game.moves, settings.reviewDepth);
    else pauseLive();
  }, [game?.moves.length, game?.status, settings.autoReview, settings.liveAnalysis, settings.reviewDepth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => pauseLive(), []);

  useEffect(() => {
    if (game?.status === 'over' && game.savedId && settings.autoReview && game.moves.length >= 2) {
      void useReviewer.getState().start(game.savedId);
    }
  }, [game?.savedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece) => {
      const g = store.getState().game;
      if (!g) return;
      const uci = from + to + (promotion ?? '');
      const c = chessOf(g);
      const legal = c.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === promotion));
      if (!legal || c.turn() !== g.userColor) {
        playSound('illegal');
        return;
      }
      if (store.getState().applyMove(uci)) {
        playSound(soundForSan(legal.san));
        setHint(null);
        setViewPly(null);
      }
    },
    [store],
  );

  const position = useMemo(() => {
    if (!game || !chess) return null;
    const ply = viewPly ?? game.moves.length;
    const c = chessOf({ startFen: game.startFen, moves: game.moves.slice(0, ply) });
    const last = ply > 0 ? game.moves[ply - 1] : undefined;
    return {
      fen: c.fen(),
      check: c.inCheck(),
      lastMove: last ? ([last.slice(0, 2), last.slice(2, 4)] as [string, string]) : undefined,
      live: ply === game.moves.length,
    };
  }, [game, chess, viewPly]);

  const dests = useMemo(() => (chess && position?.live ? legalDests(chess) : undefined), [chess, position?.live]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (!hint || !game || hint.ply !== game.moves.length || !position?.live) return [];
    return [{ orig: hint.uci.slice(0, 2) as never, dest: hint.uci.slice(2, 4) as never, brush: 'blue' }];
  }, [hint, game, position?.live]);

  // Live eval bar (training mode).
  useEffect(() => {
    if (!game?.options.evalBar || !position) return;
    const engine = getAnalysisEngine();
    const h = engine.search({ fen: position.fen, limits: { depth: 14 }, onInfo: (lines) => lines[0] && setLastEval(lines[0].score) });
    return () => h.stop();
  }, [position?.fen, game?.options.evalBar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation through the moves.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const g = store.getState().game;
      if (!g || (e.target as HTMLElement).tagName === 'INPUT') return;
      const cur = viewPly ?? g.moves.length;
      if (e.key === 'ArrowLeft') setViewPly(Math.max(0, cur - 1));
      else if (e.key === 'ArrowRight') setViewPly(cur + 1 >= g.moves.length ? null : cur + 1);
      else if (e.key === 'ArrowUp') setViewPly(0);
      else if (e.key === 'ArrowDown') setViewPly(null);
      else if (e.key === 'f') setFlipped((f) => !f);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [viewPly, store]);

  if (!game || !chess || !bot || !position) {
    return (
      <div className="page empty">
        <h2>No game in progress</h2>
        <button className="btn primary big" onClick={() => navigate('/')}>
          Choose a bot
        </button>
      </div>
    );
  }

  const userColor = game.userColor;
  const orientation = flipped ? colorName(userColor === 'w' ? 'b' : 'w') : colorName(userColor);
  const topColor = orientation === 'white' ? 'b' : 'w';
  const bottomColor = topColor === 'w' ? 'b' : 'w';
  const userName = settings.playerName || 'You';
  const playerFor = (c: 'w' | 'b') =>
    c === userColor
      ? { avatar: monogram(userName || 'You'), tint: undefined, name: userName, elo: rating }
      : { avatar: monogram(bot.name), tint: undefined, name: bot.name, elo: bot.elo };
  const playing = game.status === 'playing';
  const userToMove = playing && chess.turn() === userColor;

  const askHint = async () => {
    if (!userToMove) return;
    const res = await getAnalysisEngine().analyse({ fen: chess.fen(), limits: { depth: 16, movetime: 3000 } });
    if (res.bestmove) {
      setHint({ ply: game.moves.length, uci: res.bestmove });
      store.getState().markHint();
    }
  };

  const offerDraw = async () => {
    const res = await getBotEngine().analyse({ fen: chess.fen(), limits: { depth: 12 }, options: { UCI_LimitStrength: false } });
    const s = res.lines[0]?.score;
    const botCp = s ? (userColor === 'w' ? -1 : 1) * scoreToCp(s) : 0;
    if (botAcceptsDraw(botCp, game.moves.length, bot.elo)) store.getState().finish('1/2-1/2', 'agreement');
    else toast(`${bot.name} declined the draw`);
  };

  const resign = () => {
    setConfirmResign(false);
    store.getState().finish(userColor === 'w' ? '0-1' : '1-0', 'resignation');
  };

  const rematch = () => {
    const opts = game.options;
    store.getState().start({
      botId: game.botId,
      userColor: userColor === 'w' ? 'b' : 'w',
      startFen: game.startFen,
      timeControl: game.timeControl,
      takebacks: opts.takebacks,
      hints: opts.hints,
      evalBar: opts.evalBar,
    });
    setShowEnd(false);
    playSound('start');
  };

  const userScore = game.result === '1/2-1/2' ? 0.5 : game.result ? ((game.result === '1-0') === (userColor === 'w') ? 1 : 0) : null;
  const endTitle = userScore === 1 ? 'You won!' : userScore === 0 ? `${bot.name} won` : 'Draw';
  const fromLabel = (t?: string) => (t ? `by ${t}` : '');

  const currentIndex = (viewPly ?? game.moves.length) - 1;
  const selectMove = (i: number) => setViewPly(i + 1 >= game.moves.length ? null : i + 1);
  const back = () => setViewPly(Math.max(0, (viewPly ?? game.moves.length) - 1));
  const forward = () => setViewPly((v) => (v === null || v + 1 >= game.moves.length ? null : v + 1));
  const reviewId = game.savedId;

  return (
    <div className="game-layout focus-screen play-screen">
      <div className={`board-column ${game.options.evalBar ? 'with-evalbar' : ''}`}>
        <PlayerBar
          {...playerFor(topColor)}
          fen={position.fen}
          startFen={game.startFen}
          color={topColor}
          clock={<ClockView game={game} color={topColor} />}
        />
        <div className="board-row">
          {game.options.evalBar && <EvalBar score={lastEval} flipped={orientation === 'black'} />}
          <Board
            ref={boardRef}
            fen={position.fen}
            orientation={orientation}
            movableColor={position.live && playing ? colorName(userColor) : undefined}
            dests={dests}
            lastMove={position.lastMove}
            check={position.check}
            premovable={playing && position.live}
            onMove={onMove}
            shapes={shapes}
            viewOnly={!position.live && playing}
          />
        </div>
        <PlayerBar
          {...playerFor(bottomColor)}
          fen={position.fen}
          startFen={game.startFen}
          color={bottomColor}
          clock={<ClockView game={game} color={bottomColor} />}
        />
      </div>

      <div className="side-panel play-panel">
        <div className="panel-body only-desktop">
          <MoveList sans={game.sans} startFen={game.startFen} current={currentIndex} onSelect={selectMove} />
        </div>
        <MoveStrip sans={game.sans} startFen={game.startFen} current={currentIndex} onSelect={selectMove} />
        {!playing && (
          <div className="game-over-bar">
            <span>
              <b>{endTitle}</b> <span className="muted">{fromLabel(game.termination)}</span>
            </span>
            <button className="btn primary small" onClick={() => reviewId && navigate(`/review/${reviewId}`)} disabled={!reviewId}>
              ⭐ Review
            </button>
          </div>
        )}
        <div className="play-controls">
          <button className="ctl" onClick={back} aria-label="Previous move">
            <span className="ctl-ico">
              <ChevronLeft size={20} />
            </span>
          </button>
          <button className="ctl" onClick={forward} aria-label="Next move">
            <span className="ctl-ico">
              <ChevronRight size={20} />
            </span>
          </button>
          <button className="ctl" onClick={() => setFlipped((f) => !f)} aria-label="Flip board">
            <span className="ctl-ico">
              <ArrowUpDown size={20} />
            </span>
            <span className="ctl-label">Flip</span>
          </button>
          {playing ? (
            <>
              {game.options.hints && (
                <button className="ctl" onClick={askHint} disabled={!userToMove}>
                  <span className="ctl-ico">
                    <Lightbulb size={20} />
                  </span>
                  <span className="ctl-label">Hint</span>
                </button>
              )}
              {game.options.takebacks && (
                <button className="ctl" onClick={() => (store.getState().takeback(), setHint(null))} disabled={game.moves.length === 0}>
                  <span className="ctl-ico">
                    <Undo2 size={20} />
                  </span>
                  <span className="ctl-label">Undo</span>
                </button>
              )}
              <button className="ctl" onClick={offerDraw} disabled={game.moves.length < 2}>
                <span className="ctl-ico">
                  <Handshake size={20} />
                </span>
                <span className="ctl-label">Draw</span>
              </button>
              <button className="ctl danger" onClick={() => setConfirmResign(true)}>
                <span className="ctl-ico">
                  <Flag size={20} />
                </span>
                <span className="ctl-label">Resign</span>
              </button>
            </>
          ) : (
            <>
              <button className="ctl" onClick={() => reviewId && navigate(`/analysis?game=${reviewId}`)} disabled={!reviewId}>
                <span className="ctl-ico">
                  <Microscope size={20} />
                </span>
                <span className="ctl-label">Analyse</span>
              </button>
              <button className="ctl" onClick={rematch}>
                <span className="ctl-ico">
                  <RotateCcw size={20} />
                </span>
                <span className="ctl-label">Rematch</span>
              </button>
              <button className="ctl" onClick={() => navigate('/')}>
                <span className="ctl-ico">
                  <Plus size={20} />
                </span>
                <span className="ctl-label">New</span>
              </button>
            </>
          )}
        </div>
      </div>

      {confirmResign && (
        <Modal onClose={() => setConfirmResign(false)}>
          <h2>Resign this game?</h2>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirmResign(false)}>
              Keep playing
            </button>
            <button className="btn danger" onClick={resign}>
              Resign
            </button>
          </div>
        </Modal>
      )}

      {showEnd && game.status === 'over' && (
        <Modal onClose={() => setShowEnd(false)}>
          <div style={{ textAlign: 'center' }}>
            <div className="kicker" style={{ marginBottom: 6 }}>
              Game over
            </div>
            <h2 style={{ marginBottom: 4 }}>{endTitle}</h2>
            <div className="muted">{fromLabel(game.termination)}</div>
            {game.ratingDelta !== undefined && (
              <div style={{ marginTop: 10 }}>
                Rating vs bots: <b>{rating}</b>{' '}
                <span style={{ color: game.ratingDelta >= 0 ? 'var(--accent)' : 'var(--danger)', fontWeight: 800 }}>
                  ({game.ratingDelta >= 0 ? '+' : ''}
                  {game.ratingDelta})
                </span>
              </div>
            )}
            {reviewJob?.status === 'running' && (
              <div style={{ margin: '14px 0 0' }}>
                <div className="faint" style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                  Reviewing your game… {Math.round((reviewJob.done / reviewJob.total) * 100)}%
                </div>
                <div className="progress">
                  <div style={{ width: `${(reviewJob.done / reviewJob.total) * 100}%` }} />
                </div>
              </div>
            )}
            {reviewJob?.status === 'done' && <ReviewTeaser gameId={game.savedId!} userColor={userColor} />}
            <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
              <button className="btn primary big" onClick={() => game.savedId && navigate(`/review/${game.savedId}`)} disabled={!game.savedId}>
                ⭐ Game Review
              </button>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={rematch}>
                  Rematch
                </button>
                <button className="btn" onClick={() => navigate('/')}>
                  New bot
                </button>
                <button className="btn ghost" onClick={() => setShowEnd(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReviewTeaser({ gameId, userColor }: { gameId: string; userColor: 'w' | 'b' }) {
  const [acc, setAcc] = useState<{ me: number; them: number; counts: Record<string, number> } | null>(null);
  useEffect(() => {
    void getReview(gameId).then((r) => {
      if (!r) return;
      const me = userColor === 'w' ? r.white : r.black;
      const them = userColor === 'w' ? r.black : r.white;
      setAcc({ me: me.accuracy, them: them.accuracy, counts: me.counts });
    });
  }, [gameId, userColor]);
  if (!acc) return null;
  return (
    <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 18 }}>
      <div className="stat">
        <span className="v">{acc.me.toFixed(1)}</span>
        <span className="k">Your accuracy</span>
      </div>
      <div className="stat">
        <span className="v" style={{ color: CLASS_META.brilliant.color }}>
          {(acc.counts.brilliant ?? 0) + (acc.counts.great ?? 0)}
        </span>
        <span className="k">Great+ moves</span>
      </div>
      <div className="stat">
        <span className="v" style={{ color: CLASS_META.blunder.color }}>
          {acc.counts.blunder ?? 0}
        </span>
        <span className="k">Blunders</span>
      </div>
    </div>
  );
}
