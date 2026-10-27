// Position evaluations kept for the game review. The live game fills it in the
// background while you play, so the review after the game only has to search
// the positions it hasn't seen yet. Kept in memory and in IndexedDB.
import { createStore, entries, get, set, delMany } from 'idb-keyval';
import type { PositionEval } from './types';

const store = createStore('outpost-evals', 'evals');
const memory = new Map<string, Cached>();

interface Cached {
  pos: PositionEval;
  multipv: number;
  t: number;
}

/** Positions are keyed without move counters; the side to move, castling and en passant matter. */
const keyOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export async function getEval(fen: string, minDepth: number, multipv: number): Promise<PositionEval | null> {
  const key = keyOf(fen);
  let c = memory.get(key);
  if (!c) {
    try {
      c = await get<Cached>(key, store);
    } catch {
      c = undefined;
    }
    if (c) memory.set(key, c);
  }
  if (!c || c.pos.depth < minDepth || c.multipv < multipv) return null;
  // The FEN's move counters belong to the game asking.
  return { ...c.pos, fen };
}

export async function putEval(pos: PositionEval, multipv: number): Promise<void> {
  if (pos.terminal === 'checkmate' || pos.terminal === 'stalemate' || !pos.lines.length) return;
  const key = keyOf(pos.fen);
  const old = memory.get(key);
  if (old && (old.pos.depth > pos.depth || (old.pos.depth === pos.depth && old.multipv >= multipv))) return;
  const c: Cached = { pos, multipv, t: Date.now() };
  memory.set(key, c);
  try {
    await set(key, c, store);
  } catch {
    /* storage full or unavailable: the memory copy still helps */
  }
}

/** Drops evaluations older than a month, so the cache doesn't grow forever. */
export async function pruneEvals(maxAgeMs = 30 * 86_400_000): Promise<void> {
  try {
    const all = await entries<string, Cached>(store);
    const old = all.filter(([, c]) => Date.now() - c.t > maxAgeMs).map(([k]) => k);
    if (old.length) await delMany(old, store);
  } catch {
    /* ignore */
  }
}
