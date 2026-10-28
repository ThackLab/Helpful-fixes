import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Copy, Flag, Globe, Handshake, RotateCcw, Share2, Swords, X } from 'lucide-react';
import { Chess, type Color } from 'chess.js';
import { Board } from '../components/Board';
import { MoveStrip } from '../components/MoveList';
import { Segmented, formatClock, toast } from '../components/Widgets';
import { PageHead } from '../components/ui';
import { legalDests, playUci } from '../lib/chess/utils';
import { formatCode, normaliseCode } from '../lib/online/relay';
import { navigate } from '../lib/router';
import { copyText } from '../lib/platform';
import { playSound } from '../lib/sound';
import { baseUrl, PUBLIC_URL } from '../state/friend';
import { replay, tcLabel, timeLeft, useHeartbeat, useOnline, usePresence, useRelayStatus, type Clock, type OnlineGame } from '../state/online';
import { useSettings } from '../state/settings';
import { monogram } from '../lib/bots/bots';

export const ONLINE_CLOCKS: { label: string; tc: Clock | null }[] = [
  { label: '1 min', tc: { initial: 60_000, increment: 0 } },
  { label: '3 | 2', tc: { initial: 180_000, increment: 2000 } },
  { label: '5 min', tc: { initial: 300_000, increment: 0 } },
  { label: '10 min', tc: { initial: 600_000, increment: 0 } },
  { label: '15 | 10', tc: { initial: 900_000, increment: 10_000 } },
  { label: 'No clock', tc: null },
];

const myName = () => {
  const n = useSettings.getState().playerName;
  return n && n !== 'You' ? n : '';
};

export const inviteLink = (code: string) => `${baseUrl()}#/online/${code}`;

/** Sends the invite through the phone's share sheet, or copies it. */
export async function shareInvite(code: string, tc: Clock | null) {
  const url = inviteLink(code);
  const text = `Play me at chess on Outpost (${tcLabel(tc)})! Open the link, or in the app tap Play a friend → Join with code ${formatCode(code)}. Android app: ${PUBLIC_URL}outpost-chess.apk`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Outpost Chess', text, url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  await copyText(`${text}\n${url}`);
  toast('Invite copied. Send it to your friend.');
}

/** The "Play online" part of the Play a friend screen: challenge someone, or join with a code. */
export function OnlineLobby() {
  const create = useOnline((s) => s.create);
  const all = useOnline((s) => s.games);
  const games = useMemo(() => all.filter((g) => g.me && g.s && !g.s.r), [all]);
  const [tc, setTc] = useState(2);
  const [color, setColor] = useState<Color | 'random'>('random');
  const [name, setName] = useState(myName);
  const [code, setCode] = useState('');
  const parsed = normaliseCode(code);

  const start = () => {
    const n = name.trim();
    if (n) useSettings.getState().set({ playerName: n });
    const c = create({ tc: ONLINE_CLOCKS[tc].tc, color, name: n || 'Player' });
    playSound('start');
    navigate(`/online/${c}`);
  };

  return (
    <>
      {games.length > 0 && (
        <div className="online-list">
          {games.map((g) => (
            <OnlineRow key={g.code} g={g} />
          ))}
        </div>
      )}
      <section className="friend-card online-card">
        <h2>
          <Globe size={22} className="ic-online" /> Play online
        </h2>
        <p className="muted">
          Challenge anyone: send them a link or a code. They can play in the app or straight in their browser, live, with clocks.
        </p>
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
        <div className="tc-grid">
          {ONLINE_CLOCKS.map((c, i) => (
            <button key={c.label} className={`tc-tile ${tc === i ? 'on' : ''}`} onClick={() => setTc(i)}>
              {c.label}
            </button>
          ))}
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
        <button className="btn primary big block" onClick={start}>
          <Swords size={20} /> Create a challenge
        </button>
        <div className="join-row">
          <input
            placeholder="Got a code? XXXXX-XXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button className="btn" disabled={!parsed} onClick={() => parsed && navigate(`/online/${parsed}`)}>
            Join
          </button>
        </div>
      </section>
    </>
  );
}

function OnlineRow({ g }: { g: OnlineGame }) {
  const s = g.s!;
  const them = (g.me === 'w' ? s.b : s.w) || 'Waiting for a friend';
  const toMove: Color = s.m.length % 2 === 0 ? 'w' : 'b';
  const mine = !!(s.w && s.b) && toMove === g.me;
  return (
    <button className="today-item" onClick={() => navigate(`/online/${g.code}`)}>
      <span className="fc-avatar small">{monogram(them)}</span>
      <span className="ti-body">
        <span className="ti-title">{s.w && s.b ? `vs ${them}` : 'Challenge sent'}</span>
        <span className="ti-sub">
          {tcLabel(s.tc)} · {s.w && s.b ? (mine ? 'Your move' : 'Their move') : `code ${formatCode(g.code)}`}
        </span>
      </span>
      {mine && <span className="pill accent">Your move</span>}
    </button>
  );
}

function Clock({ g, side }: { g: OnlineGame; side: Color }) {
  const [, force] = useState(0);
  const s = g.s;
  const running = !!s?.tc && !s.r && !!s.w && !!s.b && s.m.length >= 2 && (s.m.length % 2 === 0 ? 'w' : 'b') === side;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(id);
  }, [running]);
  const left = timeLeft(g, side);
  if (left === null) return null;
  return <div className={`clock ${side === 'b' ? 'dark' : ''} ${running ? 'active' : ''} ${left < 20000 ? 'low' : ''}`}>{formatClock(left)}</div>;
}

function Presence({ code, side }: { code: string; side: Color }) {
  const seen = usePresence((s) => s.seen[code]?.[side]);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const online = !!seen && Date.now() - seen < 25_000;
  return <span className={`presence ${online ? 'on' : ''}`} title={online ? 'Online' : 'Away'} />;
}

/** `#/online/<code>`: a live game, from invite to result. */
export function OnlineGamePage({ code, autoJoin }: { code: string; autoJoin?: boolean }) {
  const g = useOnline((s) => s.games.find((x) => x.code === code));
  const { open, join, move, resign, abort, offerDraw, answerDraw, flag, rematch } = useOnline();
  const up = useRelayStatus((s) => s.up);
  const [flip, setFlip] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [name, setName] = useState(myName);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    open(code);
    const t = setTimeout(() => setWaited(true), 9000);
    return () => clearTimeout(t);
  }, [code, open]);
  useHeartbeat(code, g?.me);
  // A rematch you accepted: take the seat as soon as the game arrives.
  useEffect(() => {
    if (!autoJoin || !g?.s || g.me !== undefined) return;
    const seat: Color = g.s.host === 'w' ? 'b' : 'w';
    if (!g.s[seat]) join(code, myName() || 'Guest');
  }, [autoJoin, g?.s, g?.me, code, join]);

  // Clocks: our own flag falls straight away; the opponent's after a moment's grace for the network.
  useEffect(() => {
    if (!g?.s?.tc || g.s.r || !g.me) return;
    const me = g.me;
    const t = setInterval(() => {
      const cur = useOnline.getState().games.find((x) => x.code === code);
      if (!cur?.s || cur.s.r || !cur.s.w || !cur.s.b || cur.s.m.length < 2) return;
      const toMove: Color = cur.s.m.length % 2 === 0 ? 'w' : 'b';
      const left = timeLeft(cur, toMove) ?? 1;
      if ((toMove === me && left <= 0) || (toMove !== me && left <= -2000)) {
        flag(code, toMove);
        playSound('end');
      }
    }, 250);
    return () => clearInterval(t);
  }, [g?.s?.tc, g?.s?.r, g?.me, code, flag]);

  const r = useMemo(() => (g?.s ? replay(g.s.m) : null), [g?.s]);

  if (!g || !g.s || !r) {
    return (
      <div className="page narrow">
        <PageHead title="Joining the game" back="/friend" />
        <div className="online-wait card-box">
          <span className="spinner" />
          <p>
            {waited
              ? up
                ? `No game found with the code ${formatCode(code)}. Check it, or ask your friend to send the invite again.`
                : 'Can’t reach the game servers. Check your internet connection.'
              : `Looking for game ${formatCode(code)}…`}
          </p>
        </div>
      </div>
    );
  }

  const s = g.s;
  const host = s.host;
  const guestSeat: Color = host === 'w' ? 'b' : 'w';

  // Someone else's invite: see who it's from, then take the seat.
  if (g.me === undefined) {
    const free = !s[guestSeat];
    return (
      <div className="page narrow">
        <PageHead title="You’re invited" back="/friend" />
        <section className="friend-card online-card invite">
          <span className="fc-avatar big">{monogram(s[host] || '?')}</span>
          <h2>{free ? `${s[host] || 'A friend'} challenges you` : 'This game has two players'}</h2>
          <p className="muted">
            {free ? `${tcLabel(s.tc)} · you play ${guestSeat === 'w' ? 'White' : 'Black'}` : `${s.w} vs ${s.b}. You can watch it live.`}
          </p>
          {free && <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />}
          <button
            className="btn primary big block"
            onClick={() => {
              const n = name.trim();
              if (n) useSettings.getState().set({ playerName: n });
              join(code, n || 'Guest');
              playSound('start');
            }}
          >
            {free ? 'Accept and play' : 'Watch'}
          </button>
        </section>
      </div>
    );
  }

  const me = g.me;
  const started = !!s.w && !!s.b;
  const turn = r.chess.turn();
  const over = !!s.r;
  const myTurn = !over && started && me === turn;
  const base: Color = me ?? 'w';
  const bottom: Color = flip ? (base === 'w' ? 'b' : 'w') : base;
  const top: Color = bottom === 'w' ? 'b' : 'w';
  const ply = viewPly ?? s.m.length;
  const view = new Chess();
  for (const u of s.m.slice(0, ply)) playUci(view, u);
  const live = ply === s.m.length;
  const last = ply > 0 ? s.m[ply - 1] : undefined;
  const name_ = (c: Color) => s[c] || (c === host ? 'Host' : 'Waiting…');
  const winner: Color | null = s.r === '1-0' ? 'w' : s.r === '0-1' ? 'b' : null;
  const resultTitle =
    s.t === 'aborted'
      ? 'Game aborted'
      : s.r === '1/2-1/2'
        ? 'Draw'
        : winner === me
          ? 'You won!'
          : me
            ? `${name_(winner!)} won`
            : `${name_(winner!)} won`;
  const rematchFromThem = over && s.re && s.reBy !== me;

  const onMove = (from: string, to: string, promotion?: string) => {
    if (move(code, from + to + (promotion ?? ''))) setViewPly(null);
  };

  return (
    <div className="game-layout focus-screen play-screen">
      <div className="board-column">
        <div className="player-bar">
          <span className="pb-avatar">{s[top] ? monogram(s[top]) : '?'}</span>
          <b>{name_(top)}</b>
          {started && <Presence code={code} side={top} />}
          <span className="spacer" />
          <Clock g={g} side={top} />
        </div>
        <div className="board-row">
          <Board
            fen={view.fen()}
            orientation={bottom === 'w' ? 'white' : 'black'}
            movableColor={myTurn && live ? (turn === 'w' ? 'white' : 'black') : undefined}
            dests={myTurn && live ? legalDests(r.chess) : undefined}
            lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
            check={view.inCheck()}
            onMove={onMove}
            viewOnly={!myTurn || !live}
          />
        </div>
        <div className="player-bar">
          <span className="pb-avatar">{s[bottom] ? monogram(s[bottom]) : '?'}</span>
          <b>{name_(bottom)}</b>
          {started && <Presence code={code} side={bottom} />}
          <span className="spacer" />
          <Clock g={g} side={bottom} />
        </div>
      </div>

      <div className="side-panel play-panel">
        <MoveStrip sans={r.sans} startFen={new Chess().fen()} current={ply - 1} onSelect={(i) => setViewPly(i + 1 >= s.m.length ? null : i + 1)} />
        {!up && <div className="coach-banner warn-soft">Reconnecting…</div>}
        {!started && me ? (
          <div className="coach-banner invite-box">
            <p>
              <b>Waiting for your friend.</b> Send them the invite. When they open it, the game starts here.
            </p>
            <div className="code-big">{formatCode(code)}</div>
            <div className="row">
              <button className="btn primary" onClick={() => void shareInvite(code, s.tc)}>
                <Share2 size={16} /> Send invite
              </button>
              <button
                className="btn"
                onClick={() => {
                  void copyText(inviteLink(code));
                  toast('Link copied');
                }}
              >
                <Copy size={16} /> Copy link
              </button>
            </div>
          </div>
        ) : over ? (
          <div className="coach-banner result-box">
            <p>
              <b className="result-title">{resultTitle}</b> {s.t && s.t !== 'aborted' && <span className="faint">by {s.t}</span>}
            </p>
            <div className="row">
              {g.savedId && (
                <button className="btn primary" onClick={() => navigate(`/review/${g.savedId}`)}>
                  Game review
                </button>
              )}
              {me &&
                (rematchFromThem ? (
                  <button
                    className="btn primary"
                    onClick={() => {
                      useOnline.getState().open(s.re!);
                      navigate(`/online/${s.re}?accept=1`);
                    }}
                  >
                    <RotateCcw size={16} /> Accept rematch
                  </button>
                ) : s.re ? (
                  <button className="btn" onClick={() => navigate(`/online/${s.re}`)}>
                    Rematch offered
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() => {
                      const next = rematch(code, s[me] || myName() || 'Player');
                      if (next) navigate(`/online/${next}`);
                    }}
                  >
                    <RotateCcw size={16} /> Rematch
                  </button>
                ))}
            </div>
          </div>
        ) : s.d && me && s.d !== me ? (
          <div className="coach-banner">
            <p>
              <b>{name_(s.d)} offers a draw.</b>
            </p>
            <div className="row">
              <button className="btn primary small" onClick={() => answerDraw(code, true)}>
                Accept
              </button>
              <button className="btn small" onClick={() => answerDraw(code, false)}>
                Decline
              </button>
            </div>
          </div>
        ) : s.d && s.d === me ? (
          <div className="coach-banner">Draw offered. Waiting for {name_(me === 'w' ? 'b' : 'w')}.</div>
        ) : me === null ? (
          <div className="coach-banner">Watching live.</div>
        ) : (
          <div className="coach-banner">{myTurn ? 'Your move.' : `${name_(turn)} is thinking…`}</div>
        )}
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
          {me && !over && started && (
            <>
              <button className="ctl" onClick={() => offerDraw(code)} disabled={!!s.d || s.m.length < 2}>
                <span className="ctl-ico">
                  <Handshake size={20} />
                </span>
                <span className="ctl-label">Draw</span>
              </button>
              {s.m.length < 2 ? (
                <button className="ctl" onClick={() => abort(code)}>
                  <span className="ctl-ico">
                    <X size={20} />
                  </span>
                  <span className="ctl-label">Abort</span>
                </button>
              ) : (
                <button
                  className="ctl"
                  onClick={() => {
                    if (confirm('Resign this game?')) resign(code);
                  }}
                >
                  <span className="ctl-ico">
                    <Flag size={20} />
                  </span>
                  <span className="ctl-label">Resign</span>
                </button>
              )}
            </>
          )}
          {me && !started && (
            <button className="ctl" onClick={() => void shareInvite(code, s.tc)}>
              <span className="ctl-ico">
                <Share2 size={20} />
              </span>
              <span className="ctl-label">Invite</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
