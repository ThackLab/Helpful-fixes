// Turns a review into teaching material: a named pattern and rule of thumb
// for each mistake, and the recurring patterns of a whole game. Works purely
// from stored review data, so older reviews get lessons too.
import { Chess, type Color, type Square } from 'chess.js';
import type { GameReview, ReviewedMove } from './types';

export type Theme =
  | 'kingSafety'
  | 'backRank'
  | 'hanging'
  | 'exchanges'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered'
  | 'missedMate'
  | 'missedRecapture'
  | 'missedChance'
  | 'earlyQueen'
  | 'kingWalk'
  | 'samePieceTwice'
  | 'flankPawns'
  | 'fPawn'
  | 'development'
  | 'endgameKing'
  | 'passedPawn'
  | 'positional';

export interface ThemeInfo {
  title: string;
  /** The rule of thumb to remember. */
  rule: string;
  icon: string;
}

export const THEMES: Record<Theme, ThemeInfo> = {
  kingSafety: {
    icon: '👑',
    title: 'King safety',
    rule: 'Before every move, check your king: can the opponent give check, and what happens after each check? Forced mates start with forcing moves.',
  },
  backRank: {
    icon: '🧱',
    title: 'Back-rank weakness',
    rule: 'A king boxed in by its own pawns can be mated on the back rank. Make an escape square (h3/g3 or h6/g6) when you have a quiet moment, or keep a rook or queen guarding the back rank.',
  },
  hanging: {
    icon: '🎯',
    title: 'Hanging pieces',
    rule: 'Blunder check before you let go of a piece: is the square it lands on attacked? And what did the moved piece defend before – is anything left unguarded now?',
  },
  exchanges: {
    icon: '⚖️',
    title: 'Counting exchanges',
    rule: 'When pieces can be captured back and forth on one square, count attackers and defenders. If the opponent has more attackers, you lose material when the trades finish.',
  },
  fork: {
    icon: '🍴',
    title: 'Walking into forks',
    rule: 'A fork hits two targets at once. Watch the squares an enemy knight (or queen) can reach next move, and avoid leaving your king, queen or rooks a knight-jump apart.',
  },
  pin: {
    icon: '📌',
    title: 'Pins',
    rule: 'A pinned piece cannot move without exposing something more valuable behind it. Avoid lining up your king or queen with an enemy bishop, rook or queen, and break pins before they cost material.',
  },
  skewer: {
    icon: '🍢',
    title: 'Skewers',
    rule: 'Keep your king and queen off the same line as enemy long-range pieces – when the front piece has to move, the one behind it falls.',
  },
  discovered: {
    icon: '💥',
    title: 'Discovered attacks',
    rule: 'When an enemy piece stands between their bishop, rook or queen and your king or queen, expect it to move with a threat of its own – you then face two attacks at once.',
  },
  missedMate: {
    icon: '♚',
    title: 'Missed checkmates',
    rule: 'Look at every check first, even ones that sacrifice material. Checks are forcing, so you can calculate them to the end.',
  },
  missedRecapture: {
    icon: '↩️',
    title: 'Forgetting to recapture',
    rule: 'When your opponent captures, start by asking how you take back. Only skip the recapture if you have something stronger, like a check or a bigger capture.',
  },
  missedChance: {
    icon: '🔎',
    title: 'Missed chances',
    rule: 'After every opponent move, scan for checks, captures and threats (CCT) – for both sides. Mistakes by your opponent only help you if you notice them.',
  },
  earlyQueen: {
    icon: '♛',
    title: 'Bringing the queen out early',
    rule: 'An early queen gets chased around while your opponent develops with tempo. Develop knights and bishops first; the queen joins once the pieces are out.',
  },
  kingWalk: {
    icon: '🚶',
    title: 'Early king moves',
    rule: 'Moving the king in the opening gives up castling and leaves it in the centre where lines open quickly. Castle early instead.',
  },
  samePieceTwice: {
    icon: '🔁',
    title: 'Moving the same piece twice',
    rule: 'In the opening every move should bring a new piece into play. Moving one piece repeatedly hands your opponent a lead in development.',
  },
  flankPawns: {
    icon: '🐌',
    title: 'Slow pawn moves',
    rule: 'Edge pawn moves (a-, b-, g-, h-pawns) in the opening rarely help. Prefer central pawns (e- and d-pawns), developing pieces and castling.',
  },
  fPawn: {
    icon: '🕳️',
    title: 'Weakening the king',
    rule: 'Moving the f-pawn early opens the diagonal to your king (e1-h4 / e8-h5) and takes away its best defender. Keep the pawns in front of your king where they are unless you have a concrete reason.',
  },
  development: {
    icon: '🏗️',
    title: 'Development',
    rule: 'In the opening, aim to develop all minor pieces, control the centre and castle within the first 10 moves or so.',
  },
  endgameKing: {
    icon: '🤴',
    title: 'Use your king in the endgame',
    rule: 'With the queens off, the king becomes a strong attacking and defending piece – march it towards the centre and the pawns.',
  },
  passedPawn: {
    icon: '🏃',
    title: 'Passed pawns',
    rule: 'In the endgame, passed pawns must be pushed – and enemy passed pawns must be blocked, ideally by a knight or the king.',
  },
  positional: {
    icon: '🧭',
    title: 'Positional slips',
    rule: 'When there is no tactic, ask which of your pieces is worst placed and improve it, or target the weakest point in the enemy camp. Compare your move with the engine’s plan to see the difference.',
  },
};

const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder'];
const pieceAt = (fen: string, sq: string) => new Chess(fen).get(sq as Square);

function moveName(m: ReviewedMove) {
  return moveNo(m);
}

function moveNo(m: ReviewedMove) {
  return `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '...'} ${m.san}`;
}

/** Plies (by the same side) before `index` in which the piece now on `from` arrived there. */
function movedBefore(review: GameReview, index: number): boolean {
  const m = review.moves[index];
  const from = m.uci.slice(0, 2);
  for (let i = index - 2; i >= 0; i -= 2) if (review.moves[i].uci.slice(2, 4) === from) return true;
  return false;
}

function isBackRankMate(m: ReviewedMove): boolean {
  const mating = m.replyLine.find((s) => s.includes('#'));
  if (!mating) return false;
  const rank = m.color === 'w' ? '1' : '8';
  return /^[RQ]/.test(mating) && mating.replace(/[+#]/g, '').endsWith(rank);
}

/** The single most useful pattern behind a mistake (null for good moves). */
export function moveTheme(review: GameReview, index: number): Theme | null {
  const m = review.moves[index];
  if (!m || !BAD.includes(m.classification)) return null;
  const tags = new Set(m.tags);
  const has = (t: string) => tags.has(t) || tags.has(`allows:${t}`);

  if (tags.has('allowsMate')) return isBackRankMate(m) ? 'backRank' : 'kingSafety';
  if (tags.has('missedMate') || (m.classification === 'miss' && m.bestLine.some((s) => s.includes('#')))) return 'missedMate';
  if (tags.has('missedRecapture') || m.comment.startsWith('You needed to recapture')) return 'missedRecapture';
  // Allowed tactics (older reviews stored the bare motif together with "losesMaterial").
  const allowed = (t: string) => tags.has(`allows:${t}`) || (tags.has(t) && tags.has('losesMaterial'));
  if (allowed('fork')) return 'fork';
  if (allowed('pin')) return 'pin';
  if (allowed('skewer')) return 'skewer';
  if (allowed('discovered') || allowed('discoveredCheck')) return 'discovered';
  if (tags.has('hangs')) return 'hanging';
  if (tags.has('losesMaterial')) return m.comment.includes('attacked more times') ? 'exchanges' : 'hanging';
  if (m.classification === 'miss' || tags.has('missedTactic') || tags.has('missedWin')) return 'missedChance';

  // Opening principles.
  const moveNumber = Math.floor(m.ply / 2) + 1;
  if (m.phase === 'opening' && moveNumber <= 12) {
    const piece = pieceAt(m.fenBefore, m.uci.slice(0, 2));
    if (piece?.type === 'q' && !m.san.includes('x')) return 'earlyQueen';
    if (piece?.type === 'k' && !m.san.startsWith('O-O')) return 'kingWalk';
    if (piece?.type === 'p' && /^f[3-6]$/.test(m.san)) return 'fPawn';
    if (piece?.type === 'p' && /^[abgh][3-6]$/.test(m.san)) return 'flankPawns';
    if (piece && piece.type !== 'p' && !m.san.includes('x') && !has('escapes') && movedBefore(review, index)) return 'samePieceTwice';
    const best = m.bestMove ? pieceAt(m.fenBefore, m.bestMove.slice(0, 2)) : null;
    const backRank = m.color === 'w' ? '1' : '8';
    if (best && (best.type === 'n' || best.type === 'b') && m.bestMove![1] === backRank) return 'development';
  }
  if (m.phase === 'endgame' && m.bestMove) {
    const best = pieceAt(m.fenBefore, m.bestMove.slice(0, 2));
    if (best?.type === 'k') return 'endgameKing';
    if (best?.type === 'p') return 'passedPawn';
  }
  return 'positional';
}

export interface MoveLesson {
  theme: Theme;
  info: ThemeInfo;
}

export function moveLesson(review: GameReview, index: number): MoveLesson | null {
  const theme = moveTheme(review, index);
  return theme ? { theme, info: THEMES[theme] } : null;
}

export interface GameLesson {
  theme: Theme | 'conversion' | 'time' | 'castling';
  icon: string;
  title: string;
  /** What happened in this game, referencing moves. */
  detail: string;
  rule: string;
  plies: number[];
  /** Expected points lost to this pattern (for ranking). */
  cost: number;
}

export interface GameLessons {
  lessons: GameLesson[];
  strengths: string[];
  /** The plies to walk through in the guided "learn" mode. */
  practice: number[];
}

export interface LessonContext {
  userColor?: Color;
  result?: string;
  /** Clock (ms) left for the mover after each ply, and the starting time. */
  clocks?: number[];
  initialMs?: number;
}

const list = (ms: ReviewedMove[]) => {
  const names = ms.slice(0, 3).map(moveNo);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
};

export function gameLessons(review: GameReview, ctx: LessonContext): GameLessons {
  const color = ctx.userColor;
  const mine = review.moves.filter((m) => !color || m.color === color);
  const groups = new Map<Theme, ReviewedMove[]>();
  for (const m of mine) {
    const t = moveTheme(review, m.ply);
    if (!t) continue;
    if (t === 'positional' && m.classification === 'inaccuracy') continue; // too vague to be a lesson
    groups.set(t, [...(groups.get(t) ?? []), m]);
  }

  const lessons: GameLesson[] = [];
  for (const [theme, ms] of groups) {
    const info = THEMES[theme];
    const n = ms.length;
    const times = n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
    let detail: string;
    switch (theme) {
      case 'hanging':
        detail = `You left material unprotected ${times} (${list(ms)}).`;
        break;
      case 'missedChance':
      case 'missedMate':
        detail = `You missed a winning idea ${times}: ${ms
          .slice(0, 3)
          .map((m) => `${moveNo(m)} (${m.bestSan} was the move)`)
          .join(', ')}.`;
        break;
      case 'missedRecapture':
        detail = `You didn't take back after a capture ${times} (${list(ms)}).`;
        break;
      case 'fork':
      case 'pin':
      case 'skewer':
      case 'discovered':
        detail = `Your opponent had this tactic against you ${times} (${list(ms)}).`;
        break;
      case 'kingSafety':
      case 'backRank':
        detail = `${list(ms)} allowed a forced checkmate.`;
        break;
      case 'exchanges':
        detail = `You lost material in an exchange ${times} (${list(ms)}).`;
        break;
      case 'earlyQueen':
      case 'kingWalk':
      case 'samePieceTwice':
      case 'flankPawns':
      case 'fPawn':
      case 'development':
        detail = `In the opening: ${list(ms)}.`;
        break;
      case 'endgameKing':
      case 'passedPawn':
        detail = `In the endgame: ${list(ms)}.`;
        break;
      case 'positional':
        detail = `The engine preferred a different plan ${times} (${ms
          .slice(0, 3)
          .map((m) => `${moveName(m)} – ${m.bestSan} was better`)
          .join(', ')}).`;
        break;
      default:
        detail = `This came up ${times} (${list(ms)}).`;
    }
    lessons.push({
      theme,
      icon: info.icon,
      title: info.title,
      detail,
      rule: info.rule,
      plies: ms.map((m) => m.ply),
      cost: ms.reduce((a, m) => a + m.epLoss, 0),
    });
  }

  if (color) {
    const won = ctx.result === (color === 'w' ? '1-0' : '0-1');
    // Winning positions that slipped away.
    const peak = mine.find((m) => m.epBefore >= 0.88);
    if (peak && !won && ctx.result && ctx.result !== '*') {
      const after = mine.filter((m) => m.ply > peak.ply && BAD.includes(m.classification));
      lessons.push({
        theme: 'conversion',
        icon: '🏁',
        title: 'Converting a winning position',
        detail: `You were winning by ${moveNo(peak).split(' ')[0]} but didn't win the game.`,
        rule: 'When you are clearly ahead: trade pieces (not pawns), remove your opponent’s counterplay first, and check every threat before going for more material.',
        plies: [peak.ply, ...after.map((m) => m.ply)].slice(0, 6),
        cost: after.reduce((a, m) => a + m.epLoss, 0) + 0.3,
      });
    }
    // Time trouble.
    if (ctx.clocks?.length && ctx.initialMs) {
      const low = Math.max(30_000, ctx.initialMs * 0.1);
      const serious = mine.filter((m) => ['mistake', 'blunder', 'miss'].includes(m.classification));
      const inTrouble = serious.filter((m) => (ctx.clocks![m.ply - 2] ?? ctx.initialMs!) < low);
      if (serious.length >= 2 && inTrouble.length / serious.length >= 0.4) {
        lessons.push({
          theme: 'time',
          icon: '⏱️',
          title: 'Time management',
          detail: `${inTrouble.length} of your ${serious.length} serious mistakes came when you were low on the clock.`,
          rule: 'Bank time in simple positions and spend it at critical moments – when captures, checks or a change of structure are on the board.',
          plies: inTrouble.map((m) => m.ply),
          cost: inTrouble.reduce((a, m) => a + m.epLoss, 0),
        });
      }
    }
    // Never castled in a long game.
    const castled = mine.some((m) => m.san.startsWith('O-O'));
    const kingHome = color === 'w' ? 'e1' : 'e8';
    const at12 = mine.find((m) => m.ply >= 22);
    if (!castled && at12 && pieceAt(at12.fenBefore, kingHome)?.type === 'k' && mine.length >= 15) {
      lessons.push({
        theme: 'castling',
        icon: '🏰',
        title: 'Castle early',
        detail: 'Your king was still in the centre after move 11.',
        rule: 'Castling tucks the king away and connects the rooks. In most openings, castle within the first 8-10 moves.',
        plies: [],
        cost: 0.05,
      });
    }
  }
  lessons.sort((a, b) => b.cost - a.cost);

  const strengths: string[] = [];
  const s = color ? (color === 'w' ? review.white : review.black) : null;
  if (s) {
    const special = mine.filter((m) => m.classification === 'brilliant' || m.classification === 'great');
    if (special.length) strengths.push(`You found ${special.length === 1 ? 'a strong move' : `${special.length} strong moves`}: ${list(special)}.`);
    const book = mine.filter((m) => m.classification === 'book');
    if (book.length >= 4) strengths.push(`You knew your opening theory (${book.length} book moves).`);
    else if ((s.phases.opening ?? 0) >= 85) strengths.push(`Solid opening play (${Math.round(s.phases.opening!)}% accuracy).`);
    if (!s.counts.blunder && mine.length >= 10) strengths.push('No blunders – your blunder check is working.');
    if ((s.phases.endgame ?? 0) >= 85) strengths.push(`Clean endgame technique (${Math.round(s.phases.endgame!)}% accuracy).`);
    if (s.accuracy >= 90) strengths.push('Very accurate overall – keep it up.');
  }

  // The guided lesson walks through the costliest moments (at most five), in game order.
  const practice = mine
    .filter((m) => ['blunder', 'mistake', 'miss'].includes(m.classification) && m.bestMove)
    .sort((a, b) => b.epLoss - a.epLoss)
    .slice(0, 5)
    .map((m) => m.ply);
  // Fall back to inaccuracies so there is always something to learn from.
  if (practice.length < 3) {
    for (const m of [...mine].filter((x) => x.classification === 'inaccuracy' && x.bestMove).sort((a, b) => b.epLoss - a.epLoss)) {
      if (practice.length >= 3) break;
      practice.push(m.ply);
    }
  }
  practice.sort((a, b) => a - b);
  return { lessons: lessons.slice(0, 5), strengths, practice };
}
