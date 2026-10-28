import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { BOARDS, PIECE_SETS, THEMES, loadAllFonts, resolveBoard, resolvePieces, type BoardId, type Theme } from '../lib/appearance';
import { useSettings } from '../state/settings';
import { PageHead, SectionTitle } from '../components/ui';
import { Segmented, Toggle } from '../components/Widgets';

/** A corner of a board in a theme's colours, with a couple of its pieces. */
function MiniBoard({ board, pieces, size = 4 }: { board: BoardId; pieces: string; size?: number }) {
  const b = BOARDS.find((x) => x.id === board) ?? BOARDS[0];
  const cells = [];
  const placed: Record<string, string> = { '0-1': 'black king', '0-3': 'black knight', '1-0': 'white queen', '1-2': 'white bishop' };
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      cells.push(
        <span key={`${r}-${c}`} style={{ background: (r + c) % 2 ? b.dark : b.light }}>
          {placed[`${r}-${c}`] && <piece className={placed[`${r}-${c}`]} />}
        </span>,
      );
  return (
    <div className="mini-board" data-pieces={pieces} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {cells}
    </div>
  );
}

function ThemeCard({ t, on, onPick }: { t: Theme; on: boolean; onPick: () => void }) {
  return (
    <button className={`theme-card ${on ? 'on' : ''}`} data-theme={t.id} data-display={t.display} onClick={onPick} aria-pressed={on}>
      <MiniBoard board={t.board} pieces={t.pieces} />
      <span className="tc-body">
        <span className="tc-name">{t.name}</span>
        <span className="tc-blurb">{t.blurb}</span>
        <span className="tc-sample">
          <span className="tc-chip">Nc7+</span> wins the rook.
        </span>
      </span>
      {on && (
        <span className="tc-check" aria-hidden>
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export function AppearancePage() {
  const s = useSettings();
  useEffect(loadAllFonts, []);
  const groups = ['Warm', 'Dark', 'Colour', 'Light', 'Accessible'] as const;
  const board = resolveBoard(s);
  const pieces = resolvePieces(s);

  return (
    <div className="page narrow appearance">
      <PageHead title="Appearance" back="/settings" />

      {groups.map((g) => (
        <section key={g}>
          <SectionTitle>{g === 'Accessible' ? 'Easier to see' : g}</SectionTitle>
          <div className="theme-grid">
            {THEMES.filter((t) => t.group === g).map((t) => (
              <ThemeCard key={t.id} t={t} on={s.theme === t.id} onPick={() => s.set({ theme: t.id })} />
            ))}
          </div>
        </section>
      ))}

      <SectionTitle>Board</SectionTitle>
      <div className="swatch-row">
        <button className={`swatch-auto ${s.boardTheme === 'auto' ? 'on' : ''}`} onClick={() => s.set({ boardTheme: 'auto' })}>
          Match theme
        </button>
        {BOARDS.map((b) => (
          <button
            key={b.id}
            className={`theme-swatch ${s.boardTheme === b.id ? 'on' : ''}`}
            style={{ background: `conic-gradient(${b.dark} 0 25%, ${b.light} 0 50%, ${b.dark} 0 75%, ${b.light} 0) 0 0 / 50% 50%` }}
            onClick={() => s.set({ boardTheme: b.id })}
            aria-label={b.name}
            title={b.name}
          />
        ))}
      </div>

      <SectionTitle>Pieces</SectionTitle>
      <div className="piece-grid">
        <button className={`piece-option auto ${s.pieceSet === 'auto' ? 'on' : ''}`} onClick={() => s.set({ pieceSet: 'auto' })}>
          <span className="po-name">Match theme</span>
        </button>
        {PIECE_SETS.map((p) => (
          <button key={p.id} className={`piece-option ${s.pieceSet === p.id ? 'on' : ''}`} onClick={() => s.set({ pieceSet: p.id })}>
            <MiniBoard board={board} pieces={p.id} size={2} />
            <span className="po-name">{p.name}</span>
          </button>
        ))}
      </div>

      <SectionTitle>Reading and seeing</SectionTitle>
      <div className="settings-list">
        <div className="setting">
          <div>
            <div className="st-title">Text size</div>
          </div>
          <Segmented
            value={s.textSize}
            onChange={(textSize) => s.set({ textSize })}
            options={[
              { value: 'm', label: 'Default' },
              { value: 'l', label: 'Large' },
              { value: 'xl', label: 'Larger' },
            ]}
          />
        </div>
        <div className="setting">
          <div>
            <div className="st-title">Moves with piece pictures</div>
            <div className="desc">
              Shows <span className="tc-chip">Nf3</span> as a knight and a square, the way chess books print it.
            </div>
          </div>
          <Toggle checked={s.figurines} onChange={(figurines) => s.set({ figurines })} />
        </div>
        <div className="setting">
          <div>
            <div className="st-title">Colour-blind safe colours</div>
            <div className="desc">Blue for right and orange for wrong, instead of green and red.</div>
          </div>
          <Toggle checked={s.colorblind || s.theme === 'clear'} onChange={(colorblind) => s.set({ colorblind })} />
        </div>
        <div className="setting">
          <div>
            <div className="st-title">Name every square</div>
            <div className="desc">Writes a1, b1 and so on in each square. Handy while you learn the board.</div>
          </div>
          <Toggle checked={s.squareNames || s.theme === 'clear'} onChange={(squareNames) => s.set({ squareNames })} />
        </div>
        <div className="setting">
          <div>
            <div className="st-title">Reduce motion</div>
            <div className="desc">No sliding pieces, counting numbers or fading screens.</div>
          </div>
          <Toggle checked={s.reduceMotion} onChange={(reduceMotion) => s.set({ reduceMotion })} />
        </div>
      </div>
      <details className="credits" data-pieces={pieces}>
        <summary>Piece set credits</summary>
        <p>From lichess.org, all free to use:</p>
        <ul>
          {PIECE_SETS.map((p) => (
            <li key={p.id}>
              {p.name}: {p.credit}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
