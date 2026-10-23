// PGN parsing/writing with full support for variations, comments and NAGs,
// producing the move tree used by the analysis board.
import { Chess } from 'chess.js';
import { START_FEN, moveToUci } from './utils';

export interface TreeNode {
  id: string;
  parentId: string | null;
  children: string[];
  ply: number;
  fen: string;
  san?: string;
  uci?: string;
  comment?: string;
  nags?: number[];
}

export interface GameTree {
  rootId: string;
  nodes: Record<string, TreeNode>;
  headers: Record<string, string>;
}

let counter = 0;
export const newNodeId = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyTree(fen = START_FEN, headers: Record<string, string> = {}): GameTree {
  const rootId = 'root';
  const ply = plyFromFen(fen);
  return { rootId, nodes: { [rootId]: { id: rootId, parentId: null, children: [], ply, fen } }, headers };
}

export function plyFromFen(fen: string): number {
  const parts = fen.split(' ');
  const moveNo = +parts[5] || 1;
  return (moveNo - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

export function mainline(tree: GameTree, fromId = tree.rootId): TreeNode[] {
  const out: TreeNode[] = [];
  let node: TreeNode | undefined = tree.nodes[fromId];
  while (node && node.children.length) {
    node = tree.nodes[node.children[0]];
    out.push(node);
  }
  return out;
}

export function pathTo(tree: GameTree, id: string): TreeNode[] {
  const out: TreeNode[] = [];
  let node: TreeNode | undefined = tree.nodes[id];
  while (node && node.parentId !== null) {
    out.unshift(node);
    node = tree.nodes[node.parentId];
  }
  return out;
}

/** Adds a move (or returns the existing child) below `parentId`. Mutates a copy-on-write tree. */
export function addMove(tree: GameTree, parentId: string, uci: string): { tree: GameTree; id: string } | null {
  const parent = tree.nodes[parentId];
  if (!parent) return null;
  const existing = parent.children.find((c) => tree.nodes[c].uci === uci);
  if (existing) return { tree, id: existing };
  const chess = new Chess(parent.fen);
  let m;
  try {
    m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
  const id = newNodeId();
  const node: TreeNode = { id, parentId, children: [], ply: parent.ply + 1, fen: chess.fen(), san: m.san, uci: moveToUci(m) };
  return {
    id,
    tree: {
      ...tree,
      nodes: { ...tree.nodes, [id]: node, [parentId]: { ...parent, children: [...parent.children, id] } },
    },
  };
}

export function deleteNode(tree: GameTree, id: string): GameTree {
  const node = tree.nodes[id];
  if (!node || node.parentId === null) return tree;
  const nodes = { ...tree.nodes };
  const drop = (nid: string) => {
    for (const c of nodes[nid].children) drop(c);
    delete nodes[nid];
  };
  drop(id);
  const parent = nodes[node.parentId];
  nodes[node.parentId] = { ...parent, children: parent.children.filter((c) => c !== id) };
  return { ...tree, nodes };
}

/** Makes the variation containing `id` the main line at every branching point above it. */
export function promoteVariation(tree: GameTree, id: string): GameTree {
  const nodes = { ...tree.nodes };
  let cur = nodes[id];
  while (cur && cur.parentId !== null) {
    const parent = nodes[cur.parentId];
    if (parent.children[0] !== cur.id) {
      nodes[parent.id] = { ...parent, children: [cur.id, ...parent.children.filter((c) => c !== cur.id)] };
    }
    cur = nodes[cur.parentId];
  }
  return { ...tree, nodes };
}

export function setComment(tree: GameTree, id: string, comment: string): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, comment: comment || undefined } } };
}

/** Builds a linear tree from a start position and UCI moves. */
export function treeFromMoves(startFen: string, moves: string[], headers: Record<string, string> = {}): GameTree {
  let tree = emptyTree(startFen, headers);
  let cur = tree.rootId;
  for (const u of moves) {
    const r = addMove(tree, cur, u);
    if (!r) break;
    tree = r.tree;
    cur = r.id;
  }
  return tree;
}

// ---------------------------------------------------------------- parsing

const SUFFIX_NAGS: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
export const NAG_SYMBOLS: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
  10: '=',
  13: '∞',
  14: '⩲',
  15: '⩱',
  16: '±',
  17: '∓',
  18: '+−',
  19: '−+',
};

type Token =
  | { t: 'header'; key: string; value: string }
  | { t: 'comment'; text: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'nag'; n: number }
  | { t: 'result'; value: string }
  | { t: 'san'; value: string };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '[') {
      const end = text.indexOf(']', i);
      const body = text.slice(i + 1, end < 0 ? n : end);
      const m = body.match(/^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/);
      if (m) out.push({ t: 'header', key: m[1], value: m[2].replace(/\\"/g, '"') });
      i = end < 0 ? n : end + 1;
    } else if (c === '{') {
      const end = text.indexOf('}', i);
      out.push({ t: 'comment', text: text.slice(i + 1, end < 0 ? n : end).trim() });
      i = end < 0 ? n : end + 1;
    } else if (c === ';') {
      const end = text.indexOf('\n', i);
      out.push({ t: 'comment', text: text.slice(i + 1, end < 0 ? n : end).trim() });
      i = end < 0 ? n : end + 1;
    } else if (c === '(') {
      out.push({ t: 'open' });
      i++;
    } else if (c === ')') {
      out.push({ t: 'close' });
      i++;
    } else if (c === '$') {
      const m = text.slice(i).match(/^\$(\d+)/);
      if (m) out.push({ t: 'nag', n: +m[1] });
      i += m ? m[0].length : 1;
    } else if (c === '%' && (i === 0 || text[i - 1] === '\n')) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? n : end + 1;
    } else {
      const m = text.slice(i).match(/^[^\s{}()[\];$]+/);
      const word = m ? m[0] : c;
      i += word.length;
      if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(word)) out.push({ t: 'result', value: word === '½-½' ? '1/2-1/2' : word });
      else {
        // Strip move numbers like "12." / "12..." possibly glued to the SAN ("12.e4").
        const stripped = word.replace(/^\d+\.+/, '');
        if (!stripped) continue;
        const suffix = stripped.match(/[!?]+$/)?.[0];
        const san = suffix ? stripped.slice(0, -suffix.length) : stripped;
        if (san) out.push({ t: 'san', value: san });
        if (suffix && SUFFIX_NAGS[suffix]) out.push({ t: 'nag', n: SUFFIX_NAGS[suffix] });
      }
    }
  }
  return out;
}

export interface ParsedGame {
  tree: GameTree;
  headers: Record<string, string>;
  result: string;
  errors: string[];
}

function cleanSan(san: string) {
  return san
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
    .replace(/[+#]+$/, '')
    .replace(/e\.p\.$/, '');
}

function buildTree(tokens: Token[], headers: Record<string, string>): ParsedGame {
  const errors: string[] = [];
  let startFen = START_FEN;
  if (headers.FEN) {
    try {
      startFen = new Chess(headers.FEN).fen();
    } catch {
      errors.push('Invalid FEN header');
    }
  }
  let tree = emptyTree(startFen, headers);
  let result = headers.Result ?? '*';
  // Stack of [current node id, node id before the last move] for variations.
  let cur = tree.rootId;
  let prev: string | null = null;
  const stack: { cur: string; prev: string | null }[] = [];
  let pendingComment: string | undefined;
  for (const tok of tokens) {
    switch (tok.t) {
      case 'comment': {
        const text = tok.text.replace(/\[%[^\]]*\]/g, '').trim();
        if (!text) break;
        if (cur === tree.rootId && !tree.nodes[cur].children.length) pendingComment = text;
        else {
          const node = tree.nodes[cur];
          tree = setComment(tree, cur, node.comment ? `${node.comment} ${text}` : text);
        }
        break;
      }
      case 'nag': {
        const node = tree.nodes[cur];
        if (node.parentId !== null) tree.nodes[cur] = { ...node, nags: [...(node.nags ?? []), tok.n] };
        break;
      }
      case 'open':
        stack.push({ cur, prev });
        if (prev !== null) cur = prev;
        break;
      case 'close': {
        const s = stack.pop();
        if (s) {
          cur = s.cur;
          prev = s.prev;
        }
        break;
      }
      case 'result':
        if (!stack.length) result = tok.value;
        break;
      case 'san': {
        const parent = tree.nodes[cur];
        const chess = new Chess(parent.fen);
        let m;
        try {
          m = chess.move(cleanSan(tok.value), { strict: false });
        } catch {
          m = null;
        }
        if (!m) {
          errors.push(`Illegal move "${tok.value}" after ${parent.san ?? 'start'}`);
          // Skip the rest of this (sub)line.
          break;
        }
        const r = addMove(tree, cur, moveToUci(m));
        if (!r) break;
        tree = r.tree;
        prev = cur;
        cur = r.id;
        break;
      }
      default:
        break;
    }
  }
  if (pendingComment) tree = setComment(tree, tree.rootId, pendingComment);
  return { tree, headers, result, errors };
}

/** Parses one or more games from PGN text. */
export function parsePgn(text: string): ParsedGame[] {
  const tokens = tokenize(text.replace(/\r/g, ''));
  const games: ParsedGame[] = [];
  let headers: Record<string, string> = {};
  let body: Token[] = [];
  const flush = () => {
    if (body.some((t) => t.t === 'san') || Object.keys(headers).length) games.push(buildTree(body, headers));
    headers = {};
    body = [];
  };
  for (const tok of tokens) {
    if (tok.t === 'header') {
      if (body.some((t) => t.t === 'san')) flush();
      headers[tok.key] = tok.value;
    } else {
      body.push(tok);
      if (tok.t === 'result' && body.filter((t) => t.t === 'open').length === body.filter((t) => t.t === 'close').length) flush();
    }
  }
  flush();
  return games;
}

// ---------------------------------------------------------------- writing

const HEADER_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

export function writePgn(tree: GameTree, opts: { headers?: Record<string, string>; result?: string; variations?: boolean } = {}): string {
  const headers = { ...tree.headers, ...opts.headers };
  const result = opts.result ?? headers.Result ?? '*';
  headers.Result = result;
  const root = tree.nodes[tree.rootId];
  if (root.fen !== START_FEN) {
    headers.FEN = root.fen;
    headers.SetUp = '1';
  }
  for (const k of HEADER_ORDER) if (!(k in headers)) headers[k] = k === 'Date' ? '????.??.??' : '?';
  const keys = [...HEADER_ORDER, ...Object.keys(headers).filter((k) => !HEADER_ORDER.includes(k))];
  const head = keys.map((k) => `[${k} "${String(headers[k]).replace(/"/g, '\\"')}"]`).join('\n');

  const parts: string[] = [];
  if (root.comment) parts.push(`{${root.comment}}`);
  const moveText = (node: TreeNode, forceNumber: boolean) => {
    const white = node.ply % 2 === 1;
    const num = Math.floor((node.ply - 1) / 2) + 1;
    const prefix = white ? `${num}. ` : forceNumber ? `${num}... ` : '';
    const nags = (node.nags ?? []).map((n) => `$${n}`).join(' ');
    return `${prefix}${node.san}${nags ? ' ' + nags : ''}${node.comment ? ` {${node.comment}}` : ''}`;
  };
  const writeLine = (startId: string, firstForce: boolean): string[] => {
    const out: string[] = [];
    let id: string | undefined = startId;
    let force = firstForce;
    while (id) {
      const node: TreeNode = tree.nodes[id];
      out.push(moveText(node, force));
      force = !!node.comment;
      const parent = tree.nodes[node.parentId!];
      if (opts.variations !== false && parent.children[0] === id && parent.children.length > 1) {
        for (const alt of parent.children.slice(1)) out.push(`(${writeLine(alt, true).join(' ')})`);
        force = true;
      }
      id = node.children[0];
    }
    return out;
  };
  if (root.children.length) parts.push(...writeLine(root.children[0], true));
  parts.push(result);
  // Wrap at ~80 columns.
  const lines: string[] = [];
  let line = '';
  for (const word of parts.join(' ').split(' ')) {
    if ((line + ' ' + word).length > 80 && line) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return `${head}\n\n${lines.join('\n')}\n`;
}

/** Converts a mainline to UCI moves and the start position. */
export function mainlineMoves(tree: GameTree): { startFen: string; moves: string[]; sans: string[] } {
  const line = mainline(tree);
  return { startFen: tree.nodes[tree.rootId].fen, moves: line.map((n) => n.uci!), sans: line.map((n) => n.san!) };
}
