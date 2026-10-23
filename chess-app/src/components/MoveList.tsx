import { useEffect, useRef } from 'react';
import { ClassIcon } from './ClassIcon';
import type { Classification } from '../lib/review/types';

const QUIET: (Classification | undefined)[] = ['best', 'excellent', 'good', 'book', 'forced', undefined];

/**
 * Keeps `el` visible inside its own scrolling container only. (scrollIntoView
 * would also scroll the page, making the board jump after every move.)
 */
function revealInside(el: HTMLElement | null, box: HTMLElement | null, axis: 'x' | 'y') {
  if (!el || !box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (axis === 'y') {
    if (box.scrollHeight <= box.clientHeight) return;
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
  } else {
    if (r.left < b.left) box.scrollLeft -= b.left - r.left + 24;
    else if (r.right > b.right) box.scrollLeft += r.right - b.right + 24;
  }
}

function numbering(startFen: string) {
  const parts = startFen.split(' ');
  return { blackFirst: parts[1] === 'b', firstNo: +parts[5] || 1 };
}

/** Two-column move list (White | Black) used by the game and review screens on wide screens. */
export function MoveList({
  sans,
  startFen,
  current,
  onSelect,
  classes,
}: {
  sans: string[];
  startFen: string;
  /** Index of the highlighted move (ply - 1), -1 for the start position. */
  current: number;
  onSelect: (index: number) => void;
  classes?: (Classification | undefined)[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { blackFirst, firstNo } = numbering(startFen);
  const offset = blackFirst ? 1 : 0;
  const rows = Math.ceil((sans.length + offset) / 2);

  useEffect(() => {
    revealInside(ref.current?.querySelector<HTMLElement>('.mv.cur') ?? null, ref.current?.closest<HTMLElement>('.panel-body') ?? null, 'y');
  }, [current, sans.length]);

  const cell = (i: number) => {
    if (i < 0 || i >= sans.length) return <span />;
    const cls = classes?.[i];
    return (
      <span className={`mv ${i === current ? 'cur' : ''}`} onClick={() => onSelect(i)}>
        {!QUIET.includes(cls) && <ClassIcon cls={cls!} size={16} />}
        {sans[i]}
      </span>
    );
  };

  return (
    <div className="move-list" ref={ref}>
      {Array.from({ length: rows }, (_, r) => (
        <div className="row-alt" key={r}>
          <span className="no">{firstNo + r}.</span>
          {cell(r * 2 - offset)}
          {cell(r * 2 + 1 - offset)}
        </div>
      ))}
      {!sans.length && (
        <span className="faint" style={{ gridColumn: '1 / -1', padding: 8 }}>
          No moves yet.
        </span>
      )}
    </div>
  );
}

/** Single-line, horizontally scrolling move list for phones. */
export function MoveStrip({
  sans,
  startFen,
  current,
  onSelect,
  classes,
}: {
  sans: string[];
  startFen: string;
  current: number;
  onSelect: (index: number) => void;
  classes?: (Classification | undefined)[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { blackFirst, firstNo } = numbering(startFen);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('.mv.cur');
    if (el) revealInside(el, box, 'x');
    else if (current >= sans.length - 1) box.scrollLeft = box.scrollWidth;
  }, [current, sans.length]);

  return (
    <div className="move-strip only-mobile" ref={ref}>
      {!sans.length && <span className="faint">No moves yet</span>}
      {sans.map((san, i) => {
        const ply = i + (blackFirst ? 1 : 0);
        const white = ply % 2 === 0;
        const no = firstNo + Math.floor(ply / 2);
        const cls = classes?.[i];
        return (
          <span key={i} className="strip-item">
            {(white || i === 0) && <span className="no">{white ? `${no}.` : `${no}...`}</span>}
            <span className={`mv ${i === current ? 'cur' : ''}`} onClick={() => onSelect(i)}>
              {!QUIET.includes(cls) && <ClassIcon cls={cls!} size={14} />}
              {san}
            </span>
          </span>
        );
      })}
    </div>
  );
}
