import { useEffect, useRef } from 'react';
import { ClassIcon } from './ClassIcon';
import type { Classification } from '../lib/review/types';

/** Two-column move list (White | Black) used by the game and review screens. */
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
  const parts = startFen.split(' ');
  const blackFirst = parts[1] === 'b';
  const firstNo = +parts[5] || 1;
  const offset = blackFirst ? 1 : 0;
  const rows = Math.ceil((sans.length + offset) / 2);

  useEffect(() => {
    const el = ref.current?.querySelector('.mv.cur');
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [current]);

  const cell = (i: number) => {
    if (i < 0 || i >= sans.length) return <span />;
    const cls = classes?.[i];
    const show = cls && !['best', 'excellent', 'good', 'book', 'forced'].includes(cls);
    return (
      <span className={`mv ${i === current ? 'cur' : ''}`} onClick={() => onSelect(i)}>
        {show && <ClassIcon cls={cls} size={16} />}
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
