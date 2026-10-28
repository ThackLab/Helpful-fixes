import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronRight, Flag, Handshake, Link2, Share2, Undo2, Users, X } from 'lucide-react';
import { Chess, type Color } from 'chess.js';
import { Board } from '../components/Board';
import { MoveStrip } from '../components/MoveList';
import { Segmented, Toggle, formatClock, toast } from '../components/Widgets';
import { PageHead, SectionTitle } from '../components/ui';
import { Accent } from '../components/Rich';
import { legalDests, playUci } from '../lib/chess/utils';
import { canMate } from '../state/game';
import { linkFor, turnOf, useFriends, type FriendGame } from '../state/friend';
import { useSettings } from '../state/settings';
import { navigate } from '../lib/router';
import { copyText } from '../lib/platform';
import { playSound, soundForSan } from '../lib/sound';
import { OnlineLobby } from './Online';

const CLOCKS: { label: string; tc: { initial: number; increment: number } | null }[] = [
  { label: 'No clock', tc: null },
  { label: '5 min', tc: { initial: 300_000, increment: 0 } },
  { label: '10 min', tc: { initial: 600_000, increment: 0 } },
  { label: '15 | 10', tc: { initial: 900_000, increment: 10_000 } },
];

async function sendLink(g: FriendGame) {
  const url = linkFor(g);
  const text = g.result ? `Our chess game is over (${g.result}).` : 'Your move in our chess game.';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Outpost Chess', text, url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  await copyText(url);
  toast('Link copied. Send it to your friend.');
}

/** `#/friend`: start a game against a person, and the games by link in progress. */
export function FriendHome() {
  const { games, createLocal, createLink } = useFriends();
  const myName = useSettings((s) => (s.playerName === 'You' ? '' : s.playerName));
  const [tc, setTc] = useState(0);
  const [autoFlip, setAutoFlip] = useState(true);
  const [names, setNames] = useState({ white: myName, black: '' });
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w');
  const [link, setLink] = useState({ me: myName, friend: '' });
  const ongoing = games.filter((g) => g.mode === 'link' && !g.result);

  return (
    <div className="page narrow friend">
      <PageHead title="Play a friend" back="/" />
      <OnlineLobby />

      {ongoing.length > 0 && (
        <>
          <SectionTitle>Games by link</SectionTitle>
          <div className="list">
            {ongoing.map((g) => {
              const mine = turnOf(g) === g.me;
              return (
                <button key={g.id} className="today-item" onClick={() => navigate(`/friend/${g.id}`)}>
                  <span className={`side-dot ${g.me ?? 'w'}`} />
                  <span className="ti-body">
                    <span className="ti-title">vs {g.me === 'w' ? g.black : g.white}</span>
                    <span className="ti-sub">
                      {mine ? 'Your move' : 'Their move'} · move {Math.floor(g.moves.length / 2) + 1}
                    </span>
                  </span>
                  {mine && <span className="pill">Your move</span>}
                  <ChevronRight size={18} className="ti-go" />
                </button>
              );
            })}
          </div>
        </>
      )}

      <section className="friend-card">
        <h2 className="display">
          <Accent text="Pass *and* play" />
        </h2>
        <p className="muted">Two players, one phone. The board turns to face whoever is to move.</p>
        <div className="friend-fields">
          <input placeholder="White" value={names.white} onChange={(e) => setNames({ ...names, white: e.target.value })} />
          <input placeholder="Black" value={names.black} onChange={(e) => setNames({ ...names, black: e.target.value })} />
        </div>
        <Segmented value={tc} onChange={setTc} options={CLOCKS.map((c, i) => ({ value: i, label: c.label }))} />
        <Toggle checked={autoFlip} onChange={setAutoFlip} label="Turn the board after each move" />
        <button
          className="btn primary big block"
          onClick={() => {
            const g = createLocal({ white: names.white.trim(), black: names.black.trim(), tc: CLOCKS[tc].tc, autoFlip });
            playSound('start');
            navigate(`/friend/${g.id}`);
          }}
        >
          <Users size={18} /> Start
        </button>
      </section>

      <section className="friend-card">
        <h2 className="display">
          <Accent text="Play *by link*" />
        </h2>
        <p className="muted">
          Play at your own pace with a friend anywhere. Each move makes a link; send it over WhatsApp, iMessage or anything else, and they answer with
          a link back. No accounts, nothing stored online.
        </p>
        <div className="friend-fields">
          <input placeholder="Your name" value={link.me} onChange={(e) => setLink({ ...link, me: e.target.value })} />
          <input placeholder="Friend’s name" value={link.friend} onChange={(e) => setLink({ ...link, friend: e.target.value })} />
        </div>
        <Segmented
          value={color}
          onChange={setColor}
          options={[
            { value: 'w', label: 'White' },
            { value: 'random', label: 'Random' },
            { value: 'b', label: 'Black' },
          ]}
        />
        <button
          className="btn primary big block"
          onClick={() => {
            const me: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
            const g = createLink({ me, myName: link.me.trim(), friendName: link.friend.trim() });
            if (link.me.trim()) useSettings.getState().set({ playerName: link.me.trim() });
            navigate(`/friend/${g.id}`);
          }}
        >
          <Link2 size={18} /> Start
        </button>
      </section>
    </div>
  );
}

/** `#/friend/join?d=…`: a link from a friend. */
export function FriendJoin({ d }: { d: string | null }) {
  const receive = useFriends((s) => s.receive);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!d) return setError('That link is incomplete.');
    const r = receive(d);
    if ('error' in r) setError(r.error);
    else navigate(`/friend/${r.id}`, { replace: true });
  }, [d, receive]);
  return (
    <div className="page narrow">
      <PageHead title="Game link" back="/friend" />
      {error ? <div className="error-box">{error}</div> : <p className="muted">Opening the game…</p>}
    </div>
  );
}

function FriendClock({ g, color }: { g: FriendGame; color: Color }) {
  const [, force] = useState(0);
  const running = !g.result && !!g.tc && turnOf(g) === color && g.moves.length >= 2 && !!g.turnStartedAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [running]);
  if (!g.tc || !g.clocks) return null;
  const left = running ? g.clocks[color] - (Date.now() - g.turnStartedAt!) : g.clocks[color];
  return <div className={`clock ${color === 'b' ? 'dark' : ''} ${running ? 'active' : ''} ${left < 20000 ? 'low' : ''}`}>{formatClock(left)}</div>;
}

/** `#/friend/<id>`: the board for a game against a person. */
export function FriendBoard({ id }: { id: string }) {
  const g = useFriends((s) => s.games.find((x) => x.id === id));
  const { move, undo, finish } = useFriends();
  const [flip, setFlip] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);

  const chess = useMemo(() => {
    const c = new Chess(g?.startFen);
    for (const u of g?.moves ?? []) playUci(c, u);
    return c;
  }, [g?.startFen, g?.moves]);

  // Flag fall in pass-and-play.
  useEffect(() => {
    if (!g?.tc || g.result) return;
    const t = setInterval(() => {
      const cur = useFriends.getState().games.find((x) => x.id === id);
      if (!cur?.tc || !cur.clocks || cur.result || !cur.turnStartedAt || cur.moves.length < 2) return;
      const turn = turnOf(cur);
      if (cur.clocks[turn] - (Date.now() - cur.turnStartedAt) <= 0) {
        const c = new Chess(cur.startFen);
        for (const u of cur.moves) playUci(c, u);
        const winner = turn === 'w' ? 'b' : 'w';
        const result = canMate(c, winner) ? (winner === 'w' ? '1-0' : '0-1') : '1/2-1/2';
        finish(id, result, 'timeout');
        playSound('end');
      }
    }, 200);
    return () => clearInterval(t);
  }, [g?.tc, g?.result, id, finish]);

  if (!g) {
    return (
      <div className="page narrow">
        <PageHead title="Game not found" back="/friend" />
        <p className="muted">This game isn’t on this device.</p>
      </div>
    );
  }

  const turn = chess.turn();
  const over = !!g.result;
  const myTurn = g.mode === 'local' ? !over : !over && turn === g.me;
  const base: Color = g.mode === 'link' ? (g.me ?? 'w') : g.autoFlip ? turn : 'w';
  const bottom: Color = flip ? (base === 'w' ? 'b' : 'w') : base;
  const top: Color = bottom === 'w' ? 'b' : 'w';
  const ply = viewPly ?? g.moves.length;
  const view = new Chess(g.startFen);
  for (const u of g.moves.slice(0, ply)) playUci(view, u);
  const live = ply === g.moves.length;
  const last = ply > 0 ? g.moves[ply - 1] : undefined;
  const name = (c: Color) => (c === 'w' ? g.white : g.black);
  const resultText = g.result === '1/2-1/2' ? 'A *draw*.' : g.result ? `${name(g.result === '1-0' ? 'w' : 'b')} *won*.` : '';

  const onMove = (from: string, to: string, promotion?: string) => {
    const uci = from + to + (promotion ?? '');
    const san = new Chess(chess.fen()).move({ from, to, promotion })?.san ?? '';
    if (move(id, uci)) {
      playSound(soundForSan(san));
      setViewPly(null);
      const after = useFriends.getState().games.find((x) => x.id === id);
      if (after?.result) playSound('end');
    }
  };

  return (
    <div className="game-layout focus-screen play-screen">
      <div className="board-column">
        <div className="player-bar">
          <span className={`side-dot ${top}`} />
          <b>{name(top)}</b>
          {g.mode === 'link' && top !== g.me && <span className="faint">friend</span>}
          <span className="spacer" />
          <FriendClock g={g} color={top} />
        </div>
        <div className="board-row">
          <Board
            fen={view.fen()}
            orientation={bottom === 'w' ? 'white' : 'black'}
            movableColor={myTurn && live ? (turn === 'w' ? 'white' : 'black') : undefined}
            dests={myTurn && live ? legalDests(chess) : undefined}
            lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
            check={view.inCheck()}
            onMove={onMove}
            viewOnly={!myTurn || !live}
          />
        </div>
        <div className="player-bar">
          <span className={`side-dot ${bottom}`} />
          <b>{name(bottom)}</b>
          <span className="spacer" />
          <FriendClock g={g} color={bottom} />
        </div>
      </div>

      <div className="side-panel play-panel">
        <MoveStrip sans={g.sans} startFen={g.startFen} current={ply - 1} onSelect={(i) => setViewPly(i + 1 >= g.moves.length ? null : i + 1)} />
        {over ? (
          <div className="coach-banner">
            <p>
              <b className="display">
                <Accent text={resultText} />
              </b>{' '}
              {g.termination && <span className="faint">by {g.termination}</span>}
            </p>
            <div className="row">
              {g.savedId && (
                <button className="btn small primary" onClick={() => navigate(`/review/${g.savedId}`)}>
                  Review
                </button>
              )}
              {g.mode === 'link' && (
                <button className="btn small" onClick={() => void sendLink(g)}>
                  <Share2 size={14} /> Send the result
                </button>
              )}
            </div>
          </div>
        ) : g.mode === 'link' ? (
          <div className="coach-banner">
            {turn === g.me ? (
              <p>
                <b>Your move.</b> When you’ve made it, send the link to {g.me === 'w' ? g.black : g.white}.
              </p>
            ) : (
              <>
                <p>
                  <b>{g.moves.length ? 'Sent?' : 'Send the link to start.'}</b> Waiting for {g.me === 'w' ? g.black : g.white}’s move. Open their link
                  when it arrives.
                </p>
                <button className="btn primary block" onClick={() => void sendLink(g)}>
                  <Share2 size={16} /> Send your move
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="play-controls">
          <button className="ctl" onClick={() => navigate('/friend')} aria-label="Close">
            <span className="ctl-ico">
              <X size={20} />
            </span>
            <span className="ctl-label">Close</span>
          </button>
          <button className="ctl" onClick={() => setFlip((f) => !f)} aria-label="Flip board">
            <span className="ctl-ico">
              <ArrowUpDown size={20} />
            </span>
            <span className="ctl-label">Flip</span>
          </button>
          {g.mode === 'local' && !over && (
            <button className="ctl" onClick={() => undo(id)} disabled={!g.moves.length || !!g.tc}>
              <span className="ctl-ico">
                <Undo2 size={20} />
              </span>
              <span className="ctl-label">Undo</span>
            </button>
          )}
          {!over && (
            <>
              <button
                className="ctl"
                onClick={() => {
                  if (confirm('Agree a draw?')) finish(id, '1/2-1/2', 'agreement');
                }}
              >
                <span className="ctl-ico">
                  <Handshake size={20} />
                </span>
                <span className="ctl-label">Draw</span>
              </button>
              <button
                className="ctl"
                onClick={() => {
                  const who: Color = g.mode === 'link' ? g.me! : turn;
                  if (confirm(`${name(who)} resigns?`)) finish(id, who === 'w' ? '0-1' : '1-0', 'resignation');
                }}
              >
                <span className="ctl-ico">
                  <Flag size={20} />
                </span>
                <span className="ctl-label">Resign</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
