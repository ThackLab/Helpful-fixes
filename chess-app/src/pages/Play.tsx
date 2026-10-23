import { useState } from 'react';
import type { Color } from 'chess.js';
import { BOTS, customBot, findBot, type BotProfile } from '../lib/bots/bots';
import { navigate } from '../lib/router';
import { validateFen, START_FEN } from '../lib/chess/utils';
import { useLiveGame, type TimeControl } from '../state/game';
import { useProfile } from '../state/profile';
import { Segmented, Toggle } from '../components/Widgets';
import { playSound } from '../lib/sound';

const TIME_CONTROLS: { label: string; tc: TimeControl | null }[] = [
  { label: 'No clock', tc: null },
  { label: '1 min', tc: { initial: 60_000, increment: 0 } },
  { label: '3 | 2', tc: { initial: 180_000, increment: 2000 } },
  { label: '5 min', tc: { initial: 300_000, increment: 0 } },
  { label: '10 min', tc: { initial: 600_000, increment: 0 } },
  { label: '15 | 10', tc: { initial: 900_000, increment: 10_000 } },
  { label: '30 min', tc: { initial: 1_800_000, increment: 0 } },
];

const LS_KEY = 'outpost.play-setup';

interface Setup {
  botId: string;
  color: 'w' | 'b' | 'random';
  tc: number;
  takebacks: boolean;
  hints: boolean;
  evalBar: boolean;
  customElo: number;
}

function loadSetup(): Setup {
  const def: Setup = { botId: 'hugo', color: 'w', tc: 0, takebacks: true, hints: true, evalBar: false, customElo: 1200 };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') };
  } catch {
    return def;
  }
}

export function PlayPage() {
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [fen, setFen] = useState('');
  const [showFen, setShowFen] = useState(false);
  const rating = useProfile((s) => s.rating);
  const live = useLiveGame((s) => s.game);
  const start = useLiveGame((s) => s.start);
  const setSetup = (patch: Partial<Setup>) => {
    const next = { ...setup, ...patch };
    setSetupState(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const bot: BotProfile = setup.botId.startsWith('custom') ? customBot(setup.customElo) : (findBot(setup.botId) ?? BOTS[5]);
  const fenError = showFen && fen.trim() ? validateFen(fen.trim()) : null;
  const suggested = BOTS.reduce((best, b) => (Math.abs(b.elo - rating) < Math.abs(best.elo - rating) ? b : best), BOTS[0]);

  const begin = () => {
    const userColor: Color = setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
    start({
      botId: bot.id,
      userColor,
      startFen: showFen && fen.trim() && !fenError ? fen.trim() : START_FEN,
      timeControl: TIME_CONTROLS[setup.tc]?.tc ?? null,
      takebacks: setup.takebacks,
      hints: setup.hints,
      evalBar: setup.evalBar,
    });
    playSound('start');
    navigate('/game');
  };

  return (
    <div className="page">
      {live?.status === 'playing' && (
        <div className="card row" style={{ marginBottom: 16, background: '#2f3a26' }}>
          <span>You have a game in progress against {findBot(live.botId)?.name ?? 'a bot'}.</span>
          <span className="spacer" />
          <button className="btn primary" onClick={() => navigate('/game')}>
            Resume game
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 20 }} className="play-grid">
        <section>
          <h1>Play a bot</h1>
          <p className="muted">
            Bots from complete beginner to full-strength Stockfish. Your rating against bots is <b>{rating}</b> - try{' '}
            <a href="#/play" onClick={(e) => (e.preventDefault(), setSetup({ botId: suggested.id }))}>
              {suggested.name} ({suggested.elo})
            </a>{' '}
            for an even game.
          </p>
          <div className="bot-grid">
            {BOTS.map((b) => (
              <button key={b.id} className={`bot-tile ${bot.id === b.id ? 'sel' : ''}`} onClick={() => setSetup({ botId: b.id })}>
                <div className="avatar" style={{ background: b.tint }}>
                  {b.avatar}
                </div>
                <div className="nm">{b.name}</div>
                <div className="elo">{b.elo}</div>
              </button>
            ))}
            <button className={`bot-tile ${setup.botId.startsWith('custom') ? 'sel' : ''}`} onClick={() => setSetup({ botId: 'custom' })}>
              <div className="avatar" style={{ background: '#ffab91' }}>
                🎯
              </div>
              <div className="nm">Custom</div>
              <div className="elo">any Elo</div>
            </button>
          </div>
        </section>

        <aside className="card" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <div className="avatar lg" style={{ background: bot.tint }}>
              {bot.avatar}
            </div>
            <div>
              <h2 style={{ marginBottom: 2 }}>{bot.name}</h2>
              <div className="tag">{bot.elo} Elo</div>
              <div className="muted" style={{ marginTop: 6, fontStyle: 'italic' }}>
                “{bot.tagline}”
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            {bot.bio}
          </p>
          {setup.botId.startsWith('custom') && (
            <div style={{ margin: '10px 0 16px' }}>
              <div className="row">
                <b>Strength</b>
                <span className="spacer" />
                <input
                  type="number"
                  min={100}
                  max={3200}
                  step={25}
                  value={setup.customElo}
                  onChange={(e) => setSetup({ customElo: Math.max(100, Math.min(3200, +e.target.value || 100)) })}
                  style={{ width: 90 }}
                />
              </div>
              <input
                type="range"
                min={100}
                max={3200}
                step={25}
                value={setup.customElo}
                onChange={(e) => setSetup({ customElo: +e.target.value })}
                style={{ width: '100%', padding: 0, background: 'none', border: 0 }}
              />
            </div>
          )}

          <h3 style={{ marginTop: 14 }}>I play as</h3>
          <div className="color-pick">
            {(['w', 'random', 'b'] as const).map((c) => (
              <button
                key={c}
                className={setup.color === c ? 'on' : ''}
                onClick={() => setSetup({ color: c })}
                title={c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
              >
                {c === 'random' ? <span style={{ fontSize: 26 }}>🎲</span> : <piece className={`${c === 'w' ? 'white' : 'black'} king`} />}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: 16 }}>Time control</h3>
          <Segmented value={setup.tc} onChange={(tc) => setSetup({ tc })} options={TIME_CONTROLS.map((t, i) => ({ value: i, label: t.label }))} />

          <h3 style={{ marginTop: 16 }}>Assistance</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <Toggle checked={setup.takebacks} onChange={(takebacks) => setSetup({ takebacks })} label="Allow takebacks" />
            <Toggle checked={setup.hints} onChange={(hints) => setSetup({ hints })} label="Allow hints" />
            <Toggle checked={setup.evalBar} onChange={(evalBar) => setSetup({ evalBar })} label="Show evaluation bar (training mode)" />
            <Toggle checked={showFen} onChange={setShowFen} label="Start from a custom position" />
            {showFen && (
              <>
                <input placeholder="Paste a FEN" value={fen} onChange={(e) => setFen(e.target.value)} />
                {fenError && <div className="error-box">{fenError}</div>}
              </>
            )}
          </div>
          <button className="btn primary big" style={{ width: '100%', marginTop: 18 }} onClick={begin} disabled={!!fenError}>
            Play {bot.name}
          </button>
          <p className="faint" style={{ fontSize: '0.78rem', marginTop: 10 }}>
            Bots under 1500 use a human-like error model on top of Stockfish; stronger bots use Stockfish’s calibrated strength limiter.
          </p>
        </aside>
      </div>
      <style>{`@media (max-width: 860px) { .play-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
