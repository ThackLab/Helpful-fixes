// Opening repertoires: one move for your side in every position, the main
// replies for the other side, learnt line by line with spaced repetition. The
// trees are built offline (src/test/repertoireBuild.test.ts) from the lichess
// opening graph, with your moves checked by Stockfish.
import type { Color } from 'chess.js';

export interface RepNode {
  /** Move in UCI. */
  m: string;
  /** The same move in SAN. */
  s: string;
  c?: RepNode[];
}

export interface RepertoirePack {
  id: string;
  name: string;
  color: Color;
  group: 'White' | 'Black against 1.e4' | 'Black against 1.d4';
  /** The opening's starting moves, in SAN. */
  root: string;
  blurb: string;
  /** Moves of a system opening, in order: when one is about as good as the best move, your side plays it. Used when building the tree. */
  prefer?: string[];
}

export const REPERTOIRE_PACKS: RepertoirePack[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    color: 'w',
    group: 'White',
    root: 'e4 e5 Nf3 Nc6 Bc4',
    blurb: 'Fast development and early pressure on f7.',
    prefer: ['d3', 'c3', 'O-O', 'Re1', 'a4', 'h3', 'Nbd2', 'Bb3'],
  },
  {
    id: 'ruy',
    name: 'Ruy Lopez',
    color: 'w',
    group: 'White',
    root: 'e4 e5 Nf3 Nc6 Bb5',
    blurb: 'The classical way to fight for e5, for a long game.',
  },
  {
    id: 'scotch',
    name: 'Scotch Game',
    color: 'w',
    group: 'White',
    root: 'e4 e5 Nf3 Nc6 d4',
    blurb: 'Open the centre at once and play with your pieces.',
  },
  { id: 'qg', name: 'Queen’s Gambit', color: 'w', group: 'White', root: 'd4 d5 c4', blurb: 'Offer a pawn to take over the centre.' },
  {
    id: 'london',
    name: 'London System',
    color: 'w',
    group: 'White',
    root: 'd4 d5 Bf4',
    blurb: 'One solid set-up against nearly anything.',
    prefer: ['e3', 'Nf3', 'c3', 'Bd3', 'Nbd2', 'h3', 'O-O', 'Qc2'],
  },
  {
    id: 'e5',
    name: '1...e5',
    color: 'b',
    group: 'Black against 1.e4',
    root: 'e4 e5',
    blurb: 'Meet the centre pawn with your own: the classical answer.',
  },
  {
    id: 'sicilian',
    name: 'Sicilian Defence',
    color: 'b',
    group: 'Black against 1.e4',
    root: 'e4 c5',
    blurb: 'Fight for the centre from the side and play for a win.',
  },
  {
    id: 'french',
    name: 'French Defence',
    color: 'b',
    group: 'Black against 1.e4',
    root: 'e4 e6',
    blurb: 'A solid pawn chain and a counter-attack on the centre.',
  },
  {
    id: 'caro',
    name: 'Caro-Kann Defence',
    color: 'b',
    group: 'Black against 1.e4',
    root: 'e4 c6',
    blurb: 'Rock solid, with the light-squared bishop kept active.',
  },
  {
    id: 'scandi',
    name: 'Scandinavian Defence',
    color: 'b',
    group: 'Black against 1.e4',
    root: 'e4 d5',
    blurb: 'Hit the e4 pawn straight away. Little theory to learn.',
  },
  {
    id: 'qgd',
    name: 'Queen’s Gambit Declined',
    color: 'b',
    group: 'Black against 1.d4',
    root: 'd4 d5 c4 e6',
    blurb: 'Hold the centre with a pawn chain that has stood for a century.',
  },
  {
    id: 'slav',
    name: 'Slav Defence',
    color: 'b',
    group: 'Black against 1.d4',
    root: 'd4 d5 c4 c6',
    blurb: 'Support d5 with a pawn and keep the bishop free.',
  },
  {
    id: 'kid',
    name: 'King’s Indian Defence',
    color: 'b',
    group: 'Black against 1.d4',
    root: 'd4 Nf6 c4 g6',
    blurb: 'Let White build a centre, then strike at it.',
    prefer: ['Bg7', 'd6', 'O-O', 'e5'],
  },
];

export const findPack = (id: string) => REPERTOIRE_PACKS.find((p) => p.id === id);

export interface PackTree {
  id: string;
  tree: RepNode[];
  lines: number;
}

let loaded: Promise<Map<string, PackTree>> | null = null;

export function loadRepertoires(): Promise<Map<string, PackTree>> {
  loaded ??= fetch(`${import.meta.env.BASE_URL}repertoires.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: PackTree[]) => new Map(list.map((p) => [p.id, p])))
    .catch(() => {
      loaded = null;
      return new Map();
    });
  return loaded;
}

export interface RepLine {
  id: string;
  /** Every move from the start, in UCI and SAN, root included. */
  moves: string[];
  sans: string[];
  /** How many of the first moves are the opening's starting moves. */
  rootLength: number;
}

/** The opening's starting moves in UCI, from its SAN. */
export function rootMoves(pack: RepertoirePack, toUci: (sans: string[]) => string[]): string[] {
  return toUci(pack.root.split(' '));
}

/** Every line of a pack, from the first move to the end of the tree. */
export function linesOf(pack: RepertoirePack, tree: RepNode[], root: { moves: string[]; sans: string[] }): RepLine[] {
  const out: RepLine[] = [];
  const walk = (nodes: RepNode[], moves: string[], sans: string[]) => {
    for (const n of nodes) {
      const m = [...moves, n.m];
      const s = [...sans, n.s];
      if (n.c?.length) walk(n.c, m, s);
      else out.push({ id: `${pack.id}:${m.slice(root.moves.length).join('')}`, moves: m, sans: s, rootLength: root.moves.length });
    }
  };
  walk(tree, root.moves, root.sans);
  return out;
}

export type Deviation =
  { kind: 'you'; ply: number; expected: string; played: string } | { kind: 'them'; ply: number; played: string } | { kind: 'complete'; ply: number };

/**
 * Where a game left a repertoire: you played something else, your opponent
 * did, or the game followed the line to its end. Null if the game never
 * entered the opening.
 */
export function deviation(
  pack: RepertoirePack,
  tree: RepNode[],
  rootUci: string[],
  gameMoves: string[],
  gameSans: string[],
  you: Color,
): Deviation | null {
  if (you !== pack.color) return null;
  if (gameMoves.length < rootUci.length || rootUci.some((u, i) => gameMoves[i] !== u)) return null;
  let nodes = tree;
  for (let ply = rootUci.length; ply < gameMoves.length; ply++) {
    if (!nodes.length) return { kind: 'complete', ply };
    const next = nodes.find((n) => n.m === gameMoves[ply]);
    if (!next) {
      const mover: Color = ply % 2 === 0 ? 'w' : 'b';
      return mover === you ? { kind: 'you', ply, expected: nodes[0].s, played: gameSans[ply] } : { kind: 'them', ply, played: gameSans[ply] };
    }
    nodes = next.c ?? [];
  }
  return nodes.length ? null : { kind: 'complete', ply: gameMoves.length };
}
