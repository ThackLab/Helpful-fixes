// Builds public/openings.json from the lichess chess-openings TSV files (CC0).
// Output: a position graph so the app can name openings, detect "book" moves
// and give bots a varied opening repertoire.
//   { names: [[eco, name], ...], nodes: [[epd, nameIdx, [[uci, childIdx], ...]], ...] }
// Node 0 is the starting position.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const epdOf = (chess) => chess.fen().split(' ').slice(0, 4).join(' ');

const names = [];
const nameIndex = new Map();
const nodes = [];
const byEpd = new Map();

function nodeFor(epd) {
  let idx = byEpd.get(epd);
  if (idx === undefined) {
    idx = nodes.length;
    nodes.push([epd, -1, []]);
    byEpd.set(epd, idx);
  }
  return idx;
}

const start = new Chess();
nodeFor(epdOf(start));

for (const vol of ['a', 'b', 'c', 'd', 'e']) {
  const lines = readFileSync(join(root, 'data', 'openings', `${vol}.tsv`), 'utf8')
    .split('\n')
    .slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    let cur = 0;
    for (const tok of pgn.split(/\s+/)) {
      if (!tok || /^\d+\.+$/.test(tok)) continue;
      const mv = chess.move(tok);
      const uci = mv.from + mv.to + (mv.promotion ?? '');
      const child = nodeFor(epdOf(chess));
      const edges = nodes[cur][2];
      if (!edges.some(([u]) => u === uci)) edges.push([uci, child]);
      cur = child;
    }
    const key = `${eco}\t${name}`;
    let ni = nameIndex.get(key);
    if (ni === undefined) {
      ni = names.length;
      names.push([eco, name]);
      nameIndex.set(key, ni);
    }
    // Prefer the first (shortest / canonical) name a position receives.
    if (nodes[cur][1] === -1) nodes[cur][1] = ni;
  }
}

const out = JSON.stringify({ names, nodes });
writeFileSync(join(root, 'public', 'openings.json'), out);
console.log(`[openings] ${names.length} names, ${nodes.length} positions, ${(out.length / 1024).toFixed(0)} KiB`);
