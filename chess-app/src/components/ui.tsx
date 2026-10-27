// Small building blocks shared by the hub pages.
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { navigate } from '../lib/router';

export function PageHead({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="page-head">
      {back && (
        <button className="icon-btn back" onClick={() => (history.length > 1 ? history.back() : navigate(back))} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <span className="spacer" />
      {right}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: { label: string; href?: string; onClick?: () => void } }) {
  return (
    <div className="section-title">
      {children}
      {action &&
        (action.href ? (
          <a href={action.href}>{action.label}</a>
        ) : (
          <button type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}

export function Stars({ n, size = 16, big }: { n: number; size?: number; big?: boolean }) {
  return (
    <span className={`stars ${big ? 'big' : ''}`} aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} size={size} className={i < n ? 'on' : ''} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  );
}

export function Grade({ g, big }: { g: string; big?: boolean }) {
  return <span className={`grade ${g} ${big ? 'big' : ''}`}>{g}</span>;
}

export function Meter({ value, gold }: { value: number; gold?: boolean }) {
  return (
    <span className={`meter ${gold ? 'gold' : ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

export function Ring({
  value,
  size = 64,
  stroke = 6,
  color = 'var(--accent)',
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {label !== undefined && <span className="ring-label">{label}</span>}
    </span>
  );
}

export function ListRow({
  icon,
  iconClass,
  title,
  sub,
  end,
  onClick,
  href,
  disabled,
  className,
}: {
  icon?: ReactNode;
  iconClass?: string;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const go = onClick ?? (href ? () => navigate(href) : undefined);
  return (
    <button className={`list-row ${className ?? ''}`} onClick={go} disabled={disabled} type="button">
      {icon !== undefined && <span className={`lr-ico ${iconClass ?? ''}`}>{icon}</span>}
      <span className="lr-body">
        <span className="lr-title">{title}</span>
        {sub && <span className="lr-sub">{sub}</span>}
      </span>
      <span className="lr-end">
        {end}
        {!disabled && <ChevronRight size={18} />}
      </span>
    </button>
  );
}

export function Sparkline({ values, height = 44, color = 'var(--info)' }: { values: number[]; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const width = 240;
  const min = Math.min(...values) - 10;
  const max = Math.max(...values) + 10;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / (max - min)) * height).toFixed(1)}`);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} aria-label="Rating history">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
