import { useState } from 'react';
import { Segmented, Toggle, toast } from '../components/Widgets';
import { canUseThreads, hardwareThreads } from '../lib/engine/manager';
import { exportAll, importAll, wipeAll, type Backup } from '../lib/storage/db';
import { useLearn } from '../state/learn';
import { useProfile } from '../state/profile';
import { useSettings } from '../state/settings';
import { themeOf } from '../lib/appearance';
import { saveTextFile } from '../lib/platform';
import { ListRow, PageHead } from '../components/ui';

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const profile = useProfile();
  const [ratingInput, setRatingInput] = useState(String(profile.rating));
  const threads = canUseThreads();

  const download = async () => {
    const data = await exportAll(
      JSON.parse(localStorage.getItem('outpost.profile') ?? 'null'),
      JSON.parse(localStorage.getItem('outpost.learn') ?? 'null'),
    );
    try {
      const where = saveTextFile(`outpost-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(data));
      if (where) toast(`Backup saved to ${where}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the backup');
    }
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Backup;
      await importAll(data);
      if (data.profile) localStorage.setItem('outpost.profile', JSON.stringify(data.profile));
      if (data.learn) localStorage.setItem('outpost.learn', JSON.stringify(data.learn));
      toast(`Restored ${data.games.length} games`);
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Invalid backup');
    }
  };

  return (
    <div className="page">
      <PageHead title="Settings" back="/you" />
      <div className="list" style={{ marginBottom: 16 }}>
        <ListRow title="Appearance" sub={`${themeOf(s.theme).name} theme · boards, pieces, text size and colour-blind options`} href="/appearance" />
      </div>
      <div className="settings-grid">
        <section className="card">
          <h2>Board</h2>
          <Row title="Coordinates">
            <Toggle checked={s.coordinates} onChange={(coordinates) => s.set({ coordinates })} />
          </Row>
          <Row title="Show legal moves">
            <Toggle checked={s.showLegalMoves} onChange={(showLegalMoves) => s.set({ showLegalMoves })} />
          </Row>
          <Row title="Animations">
            <Toggle checked={s.animation} onChange={(animation) => s.set({ animation })} />
          </Row>
          <Row title="Premoves" desc="Queue a move while the bot is thinking">
            <Toggle checked={s.premoves} onChange={(premoves) => s.set({ premoves })} />
          </Row>
          <Row title="Always promote to queen">
            <Toggle checked={s.autoQueen} onChange={(autoQueen) => s.set({ autoQueen })} />
          </Row>
          <Row title="Sound effects">
            <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} />
          </Row>
        </section>

        <section className="card">
          <h2>Game review</h2>
          <Row title="Review automatically" desc="Start the Stockfish review as soon as a game ends">
            <Toggle checked={s.autoReview} onChange={(autoReview) => s.set({ autoReview })} />
          </Row>
          <Row
            title="Analyse while you play"
            desc="Reviews positions in the background during the game, so the review is ready almost as soon as it ends"
          >
            <Toggle checked={s.liveAnalysis} onChange={(liveAnalysis) => s.set({ liveAnalysis })} />
          </Row>
          <Row title="Review depth" desc="Deeper is more accurate but slower">
            <Segmented
              value={s.reviewDepth}
              onChange={(reviewDepth) => s.set({ reviewDepth })}
              options={[
                { value: 12, label: 'Fast' },
                { value: 16, label: 'Standard' },
                { value: 20, label: 'Deep' },
              ]}
            />
          </Row>
          <h2 style={{ marginTop: 18 }}>Analysis engine</h2>
          <Row
            title="Threads"
            desc={
              threads
                ? `Multi-threaded engine available (${hardwareThreads()} cores)`
                : 'This host does not allow multi-threading; the single-threaded engine is used'
            }
          >
            <input
              type="number"
              min={1}
              max={hardwareThreads()}
              value={s.engineThreads}
              disabled={!threads}
              onChange={(e) => s.set({ engineThreads: Math.max(1, Math.min(hardwareThreads(), +e.target.value || 1)) })}
              style={{ width: 70 }}
            />
          </Row>
          <Row title="Hash (MB)">
            <Segmented
              value={s.engineHash}
              onChange={(engineHash) => s.set({ engineHash })}
              options={[32, 64, 128, 256].map((v) => ({ value: v, label: v }))}
            />
          </Row>
          <Row title="Best-move arrows on the analysis board">
            <Toggle checked={s.showArrows} onChange={(showArrows) => s.set({ showArrows })} />
          </Row>
        </section>

        <section className="card">
          <h2>Profile</h2>
          <Row title="Display name">
            <input value={s.playerName} onChange={(e) => s.set({ playerName: e.target.value })} style={{ width: 160 }} />
          </Row>
          <Row title="Rating vs bots" desc="Starts at 1000 and adjusts after each rated bot game. Set it to your real rating if you like.">
            <div className="row">
              <input type="number" value={ratingInput} onChange={(e) => setRatingInput(e.target.value)} style={{ width: 80 }} />
              <button
                className="btn small"
                onClick={() => {
                  const r = Math.max(100, Math.min(3200, +ratingInput || 1000));
                  profile.setRating(r);
                  toast('Rating updated');
                }}
              >
                Set
              </button>
            </div>
          </Row>
        </section>

        <section className="card">
          <h2>AI coach (optional)</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Ask follow-up questions about your reviewed games in plain English. Answers come from Claude ({'claude-opus-5-5'}), grounded in the
            Stockfish review. You need your own key from{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            ; usage is billed to your Anthropic account (typically a few cents per question). The key is stored only in this browser and sent only to
            the Anthropic API.
          </p>
          <Row title="Anthropic API key">
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={s.aiCoachKey}
              onChange={(e) => s.set({ aiCoachKey: e.target.value.trim() })}
              style={{ width: 220 }}
            />
          </Row>
        </section>

        <section className="card">
          <h2>Your data</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Games, reviews, course progress and puzzle ratings are stored only on this device. Back them up to move to another one.
          </p>
          <div className="row">
            <button className="btn" onClick={download}>
              Export backup
            </button>
            <label className="btn">
              Restore backup
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
              />
            </label>
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm('Delete ALL games, reviews and practice positions? This cannot be undone.')) return;
                await wipeAll();
                toast('All data deleted');
              }}
            >
              Delete everything
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!confirm('Reset your course progress, exam results and puzzle rating?')) return;
                useLearn.getState().reset();
                toast('Learning progress reset');
              }}
            >
              Reset learning progress
            </button>
          </div>
        </section>

        <section className="card">
          <h2>About</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Outpost uses{' '}
            <a href="https://stockfishchess.org" target="_blank" rel="noreferrer">
              Stockfish 18
            </a>{' '}
            (GPLv3) compiled to WebAssembly by{' '}
            <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
              stockfish.js
            </a>
            , the{' '}
            <a href="https://github.com/lichess-org/chessground" target="_blank" rel="noreferrer">
              chessground
            </a>{' '}
            board (GPLv3),{' '}
            <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">
              chess.js
            </a>{' '}
            and the lichess{' '}
            <a href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">
              opening names
            </a>{' '}
            dataset (CC0). Accuracy uses the published lichess formula; move classes follow chess.com’s expected-points thresholds.
          </p>
        </section>
      </div>
    </div>
  );
}
