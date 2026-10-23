import { CLASS_META, type Classification } from '../lib/review/types';

// Icon artwork in a 100x100 box, shared by the HTML move list and the
// on-board badges (chessground custom SVG).
const GLYPHS: Record<Classification, string> = {
  brilliant:
    '<text x="50" y="69" font-size="52" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" letter-spacing="-4">!!</text>',
  great: '<text x="50" y="70" font-size="58" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif">!</text>',
  best: '<polygon fill="#fff" points="50,18 59.4,39 82,41.2 64.8,56.2 70,78.5 50,66.8 30,78.5 35.2,56.2 18,41.2 40.6,39"/>',
  excellent: '<path fill="#fff" d="M27 47h11v31H27zM43 47l9-19c2.5-5 10-3.5 9.5 2.5L60 42h15c4.5 0 7.5 4 6.5 8.5l-4.5 21c-.8 3.8-4 6.5-8 6.5H43z"/>',
  good: '<polyline points="27,52 43,68 74,34" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path fill="#fff" d="M24 30c9-4 18-4 24 1v44c-6-5-15-5-24-1zM76 30c-9-4-18-4-24 1v44c6-5 15-5 24-1z"/>',
  forced: '<path fill="#fff" d="M25 44h32V30l22 20-22 20V56H25z"/>',
  inaccuracy:
    '<text x="50" y="69" font-size="50" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" letter-spacing="-3">?!</text>',
  mistake: '<text x="50" y="70" font-size="58" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif">?</text>',
  miss: '<path d="M32 32L68 68M68 32L32 68" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
  blunder:
    '<text x="50" y="69" font-size="50" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" letter-spacing="-3">??</text>',
};

export function iconInner(cls: Classification): string {
  return `<circle cx="50" cy="50" r="48" fill="${CLASS_META[cls].color}"/>${GLYPHS[cls]}`;
}

/** Badge drawn in the top-right corner of a board square. */
export function boardBadge(cls: Classification): string {
  return `<g transform="translate(64 -6) scale(0.42)"><circle cx="50" cy="54" r="48" fill="rgba(0,0,0,.35)"/>${iconInner(cls)}</g>`;
}

export function ClassIcon({ cls, size = 18, title }: { cls: Classification; size?: number; title?: string }) {
  return (
    <svg
      className="class-icon"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title ?? CLASS_META[cls].label}
      dangerouslySetInnerHTML={{ __html: `<title>${title ?? CLASS_META[cls].label}</title>${iconInner(cls)}` }}
    />
  );
}
