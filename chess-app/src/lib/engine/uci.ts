// UCI protocol types and parsing. All scores exposed by this module are
// normalised to White's point of view so callers never have to think about
// whose turn it was when the engine produced them.

export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number };

export interface PvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  /** Score from White's perspective. Mate value > 0 means White mates. */
  score: Score;
  bound?: 'lower' | 'upper';
  /** Win/draw/loss per mille from White's perspective. */
  wdl?: [number, number, number];
  nodes?: number;
  nps?: number;
  time?: number;
  /** Principal variation in UCI notation. */
  pv: string[];
}

export interface SearchLimits {
  depth?: number;
  movetime?: number;
  nodes?: number;
  infinite?: boolean;
  /** Restrict the search to these UCI moves. */
  searchmoves?: string[];
}

export interface SearchResult {
  bestmove: string | null;
  ponder?: string;
  /** Final lines ordered by multipv rank. */
  lines: PvLine[];
  depth: number;
  fen: string;
}

export function parseInfo(line: string, whiteToMove: boolean): PvLine | null {
  const t = line.split(' ');
  if (t[0] !== 'info') return null;
  const out: Partial<PvLine> & { pv?: string[] } = { multipv: 1 };
  let raw: Score | undefined;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        out.depth = +t[++i];
        break;
      case 'seldepth':
        out.seldepth = +t[++i];
        break;
      case 'multipv':
        out.multipv = +t[++i];
        break;
      case 'nodes':
        out.nodes = +t[++i];
        break;
      case 'nps':
        out.nps = +t[++i];
        break;
      case 'time':
        out.time = +t[++i];
        break;
      case 'score': {
        const kind = t[++i];
        const v = +t[++i];
        raw = kind === 'mate' ? { type: 'mate', value: v } : { type: 'cp', value: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          out.bound = t[++i] === 'lowerbound' ? 'lower' : 'upper';
        }
        break;
      }
      case 'wdl': {
        const w = +t[++i],
          d = +t[++i],
          l = +t[++i];
        out.wdl = whiteToMove ? [w, d, l] : [l, d, w];
        break;
      }
      case 'pv':
        out.pv = t.slice(i + 1);
        i = t.length;
        break;
      case 'string':
        return null;
      default:
        break;
    }
  }
  if (!raw || out.depth === undefined) return null;
  const sign = whiteToMove ? 1 : -1;
  out.score = raw.type === 'cp' ? { type: 'cp', value: raw.value * sign } : { type: 'mate', value: raw.value * sign };
  if (out.bound && !whiteToMove) out.bound = out.bound === 'lower' ? 'upper' : 'lower';
  out.pv ??= [];
  return out as PvLine;
}

export function formatScore(score: Score | undefined, opts: { signed?: boolean } = {}): string {
  if (!score) return '…';
  if (score.type === 'mate') {
    if (score.value === 0) return '#';
    return `${score.value > 0 ? '' : '-'}M${Math.abs(score.value)}`;
  }
  const v = score.value / 100;
  const s = Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  return opts.signed === false || v <= 0 ? s : `+${s}`;
}

/** Converts a score to centipawns, mapping mates to large values. */
export function scoreToCp(score: Score): number {
  if (score.type === 'cp') return score.value;
  if (score.value === 0) return 0;
  return Math.sign(score.value) * (10000 - Math.abs(score.value) * 10);
}

export function negateScore(score: Score): Score {
  return score.type === 'cp' ? { type: 'cp', value: -score.value } : { type: 'mate', value: -score.value };
}
