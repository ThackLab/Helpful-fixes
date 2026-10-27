import { useState } from 'react';
import { Dices, Play } from 'lucide-react';
import { BOTS, findBot, monogram, type BotProfile } from '../lib/bots/bots';
import { navigate } from '../lib/router';
import { validateFen, START_FEN } from '../lib/chess/utils';
import { useLiveGame } from '../state/game';
import { useProfile } from '../state/profile';
import { TIME_CONTROLS, loadSetup, saveSetup, setupBot, startBotGame, suggestedBot, type Setup } from '../state/playSetup';
import { Segmented, Toggle } from '../components/Widgets';
import { PageHead } from '../components/ui';

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
      <PageHead title="New game" sub={`Your rating ${rating} · ${suggested.name} (${suggested.elo}) is an even game`} back="/" />
      {live?.status === 'playing' && (
        <div className="resume-card" style={{ marginBottom: 16 }}>
          <span style={{ flex: 1 }}>You have a game in progress against {findBot(live.botId)?.name ?? 'a bot'}.</span>
          <button className="btn primary" onClick={() => navigate('/game')}>
            Resume
          </button>
        </div>
      )}
      <div className="play-setup">
        <section>
          <span className="field-label">Opponent</span>
          <div className="bot-grid">
            {BOTS.map((b) => (
              <button key={b.id} className={`bot-tile ${bot.id === b.id ? 'sel' : ''}`} onClick={() => setSetup({ botId: b.id })}>
                <div className="avatar">{monogram(b.name)}</div>
                <div className="nm">{b.name}</div>
                <div className="elo">{b.id === suggested.id ? 'your level' : b.elo}</div>
              </button>
            ))}
            <button className={`bot-tile ${setup.botId.startsWith('custom') ? 'sel' : ''}`} onClick={() => setSetup({ botId: 'custom' })}>
              <div className="avatar">#</div>
              <div className="nm">Custom</div>
              <div className="elo">any Elo</div>
            </button>
          </div>
        </section>

        <aside className="card">
          <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap', gap: 14 }}>
            <div className="avatar lg">{monogram(bot.name)}</div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ marginBottom: 4 }}>{bot.name}</h2>
              <span className="pill">{bot.elo} Elo</span>
              <div className="muted" style={{ marginTop: 6, fontSize: '0.9rem' }}>
                {bot.tagline}
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            {bot.bio}
          </p>
          {setup.botId.startsWith('custom') && (
            <div>
              <div className="row">
                <span className="field-label" style={{ margin: 0 }}>
                  Strength
                </span>
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

          <div>
            <span className="field-label">I play as</span>
            <div className="color-pick">
              {(['w', 'random', 'b'] as const).map((c) => (
                <button
                  key={c}
                  className={setup.color === c ? 'on' : ''}
                  onClick={() => setSetup({ color: c })}
                  title={c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                >
                  {c === 'random' ? <Dices size={26} /> : <piece className={`${c === 'w' ? 'white' : 'black'} king`} />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="field-label">Time control</span>
            <Segmented value={setup.tc} onChange={(tc) => setSetup({ tc })} options={TIME_CONTROLS.map((t, i) => ({ value: i, label: t.label }))} />
          </div>

          <div>
            <span className="field-label">Assistance</span>
            <div style={{ display: 'grid', gap: 10 }}>
              <Toggle checked={setup.takebacks} onChange={(takebacks) => setSetup({ takebacks })} label="Allow takebacks" />
              <Toggle checked={setup.hints} onChange={(hints) => setSetup({ hints })} label="Allow hints" />
              <Toggle checked={setup.evalBar} onChange={(evalBar) => setSetup({ evalBar })} label="Show evaluation bar" />
              <Toggle checked={showFen} onChange={setShowFen} label="Start from a position" />
              {showFen && (
                <>
                  <input placeholder="Paste a FEN" value={fen} onChange={(e) => setFen(e.target.value)} />
                  {fenError && <div className="error-box">{fenError}</div>}
                </>
              )}
            </div>
          </div>
          <button className="btn primary big block" onClick={begin} disabled={!!fenError}>
            <Play size={20} fill="currentColor" /> Play {bot.name}
          </button>
          <p className="faint" style={{ fontSize: '0.78rem', margin: 0 }}>
            Bots under 1500 play like people at their rating: they notice some things and miss others. Stronger bots use Stockfish’s strength limiter.
          </p>
        </aside>
      </div>
    </div>
  );
}
