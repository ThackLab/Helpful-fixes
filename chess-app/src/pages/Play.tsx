import { useState } from 'react';
import { BOTS, findBot, type BotProfile } from '../lib/bots/bots';
import { navigate } from '../lib/router';
import { validateFen, START_FEN } from '../lib/chess/utils';
import { useLiveGame } from '../state/game';
import { useProfile } from '../state/profile';
import { TIME_CONTROLS, loadSetup, saveSetup, setupBot, startBotGame, suggestedBot, type Setup } from '../state/playSetup';
import { Segmented, Toggle } from '../components/Widgets';

export function PlayPage({ initialFen }: { initialFen?: string }) {
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [fen, setFen] = useState(initialFen ?? '');
  const [showFen, setShowFen] = useState(!!initialFen);
  const rating = useProfile((s) => s.rating);
  const live = useLiveGame((s) => s.game);
  const setSetup = (patch: Partial<Setup>) => {
    const next = { ...setup, ...patch };
    setSetupState(next);
    saveSetup(next);
  };
  const bot: BotProfile = setupBot(setup);
  const fenError = showFen && fen.trim() ? validateFen(fen.trim()) : null;
  const suggested = suggestedBot(rating);

  const begin = () => {
    saveSetup(setup);
    startBotGame(setup, showFen && fen.trim() && !fenError ? fen.trim() : START_FEN);
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
