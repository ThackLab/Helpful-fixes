import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Score } from '../lib/engine/uci';
import { formatScore } from '../lib/engine/uci';
import { evalBarFraction } from '../lib/review/winprob';
import { capturedPieces } from '../lib/chess/utils';
import { CLASS_META, type Classification } from '../lib/review/types';

const ROLE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#81b64c" />
      <path
        fill="#fff"
        d="M22 50h20l-2-6H24zm3-8h14l-2-12 4-4-3-8h-4l-1 3h-2l-1-3h-4l-3 8 4 4z"
        stroke="#3e6e2c"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EvalBar({ score, flipped, mateLabel }: { score?: Score; flipped?: boolean; mateLabel?: string }) {
  const frac = evalBarFraction(score);
  const text = mateLabel ?? (score ? formatScore(score, { signed: false }).replace('-', '') : '');
  const whiteAhead = frac >= 0.5;
  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`} title={score ? formatScore(score) : 'Evaluation'}>
      <div className="white" style={{ height: `${frac * 100}%` }} />
      {text && <div className={`label ${whiteAhead ? 'bottom' : 'top'}`}>{text}</div>}
    </div>
  );
}

export interface GraphPoint {
  /** White expected score 0..1 (after the move at this index). */
  value: number;
  cls?: Classification;
}

export function EvalGraph({
  points,
  current,
  onSelect,
  height = 90,
}: {
  points: GraphPoint[];
  current: number;
  onSelect?: (index: number) => void;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const n = Math.max(points.length, 2);
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - v * H;
  const path = useMemo(() => {
    if (!points.length) return '';
    let d = `M0,${H} L0,${y(0.5)} `;
    points.forEach((p, i) => (d += `L${x(i).toFixed(1)},${y(p.value).toFixed(1)} `));
    d += `L${x(points.length - 1).toFixed(1)},${H} Z`;
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, H]);

  const indexAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const rel = (clientX - r.left) / r.width;
    return Math.max(0, Math.min(points.length - 1, Math.round(rel * (n - 1))));
  };

  const marked = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.cls && ['blunder', 'mistake', 'miss', 'brilliant', 'great', 'inaccuracy'].includes(p.cls));

  return (
    <svg
      ref={ref}
      className="eval-graph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      onMouseMove={(e) => setHover(indexAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onSelect?.(indexAt(e.clientX))}
      role="img"
      aria-label="Evaluation graph"
    >
      <path d={path} fill="#fff" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {marked.map(({ p, i }) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={p.cls === 'inaccuracy' ? 3 : 4.5}
          fill={CLASS_META[p.cls!].color}
          stroke="#222"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {current >= 0 && current < points.length && (
        <line x1={x(current)} x2={x(current)} y1="0" y2={H} stroke="#81b64c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      )}
      {hover !== null && hover !== current && (
        <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="#ffffff66" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

export function Captured({ fen, color, startFen }: { fen: string; color: 'w' | 'b'; startFen?: string }) {
  const cap = capturedPieces(fen, startFen);
  const list = color === 'w' ? cap.w : cap.b;
  const diff = color === 'w' ? cap.diff : -cap.diff;
  const victim = color === 'w' ? 'black' : 'white';
  return (
    <div className="captured">
      {list.map((p, i) => (
        <piece key={i} className={`${victim} ${ROLE[p]}`} />
      ))}
      {diff > 0 && <span className="diff">+{diff}</span>}
    </div>
  );
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10000) {
    const s = Math.floor(total / 1000);
    const t = Math.floor((total % 1000) / 100);
    return `0:0${s}.${t}`;
  }
  const s = Math.ceil(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function PlayerBar({
  avatar,
  tint,
  name,
  elo,
  fen,
  startFen,
  color,
  clock,
  extra,
}: {
  avatar: ReactNode;
  tint?: string;
  name: string;
  elo?: number | string;
  fen: string;
  startFen?: string;
  color: 'w' | 'b';
  clock?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="player-bar">
      <div className="avatar" style={{ background: tint }}>
        {avatar}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="player-name">
          <span>{name}</span>
          {elo !== undefined && <span className="player-elo">({elo})</span>}
          {extra}
        </div>
        <Captured fen={fen} color={color} startFen={startFen} />
      </div>
      {clock}
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { width: 'min(760px, 100%)' } : undefined} role="dialog">
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el && (el.style.display = 'none'), 2600);
}

export function ScoreChip({ score }: { score?: Score }) {
  if (!score) return null;
  const white = score.type === 'mate' ? score.value > 0 : score.value >= 0;
  return (
    <span className="eval-chip" style={{ background: white ? '#eee' : '#403d39', color: white ? '#222' : '#fff' }}>
      {formatScore(score)}
    </span>
  );
}
