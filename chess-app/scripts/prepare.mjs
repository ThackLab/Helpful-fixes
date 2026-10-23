// Prepares generated assets before `vite` runs:
//  - copies the Stockfish WASM builds from node_modules into public/engine
//    (too big to commit);
//  - derives a piece stylesheet from chessground's cburnett set that also
//    works outside the board (captured pieces, promotion picker, editor).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');
const files = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm', 'stockfish-18-lite.js', 'stockfish-18-lite.wasm'];

if (!existsSync(src)) {
  console.error('[prepare] node_modules/stockfish not found - run `npm install` first.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
let copied = 0;
for (const f of files) {
  const from = join(src, f);
  const to = join(dest, f);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(`[prepare] Stockfish ready in public/engine (${copied} file(s) updated).`);

const pieces = readFileSync(join(root, 'node_modules', 'chessground', 'assets', 'chessground.cburnett.css'), 'utf8');
writeFileSync(join(root, 'src', 'styles', 'pieces.generated.css'), pieces.replaceAll('.cg-wrap piece', 'piece'));
console.log('[prepare] piece styles generated.');
