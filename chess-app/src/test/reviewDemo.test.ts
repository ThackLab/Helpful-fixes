// Prints a full review of a sample game. Run with: REVIEW_DEMO=1 npx vitest run src/test/reviewDemo.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { it } from 'vitest';
import { setOpeningBook } from '../lib/chess/openings';
import { reviewGame } from '../lib/review/review';
import { CLASS_META } from '../lib/review/types';
import { nodeEngine } from './nodeEngine';

const GAMES: Record<string, string> = {
  opera:
    '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8#',
  beginner: '1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#',
  club: '1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Be7 5.e3 O-O 6.Nf3 h6 7.Bh4 b6 8.cxd5 Nxd5 9.Bxe7 Qxe7 10.Nxd5 exd5 11.Rc1 Be6 12.Qa4 c5 13.Qa3 Rc8 14.Bb5 a6 15.dxc5 bxc5 16.O-O Ra7 17.Be2 Nd7 18.Nd4 Qf8 19.Nxe6 fxe6 20.e4 d4 21.f4 Qe7 22.e5 Rb8 23.Bc4 Kh8 24.Qh3 Nf8 25.b3 a5 26.f5 exf5 27.Rxf5 Nh7 28.Rcf1 Qd8 29.Qg3 Re7 30.h4 Rbb7 31.e6 Rbc7 32.Qe5 Qe8 33.a4 Qd8 34.R1f2 Qe8 35.R2f3 Qd8 36.Bd3 Qe8 37.Qe4 Nf6 38.Rxf6 gxf6 39.Rxf6 Kg8 40.Bc4 Kh8 41.Qf4',
};

it.skipIf(!process.env.REVIEW_DEMO)('review demo', { timeout: 600000 }, async () => {
  const data = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/openings.json', import.meta.url)), 'utf8'));
  const book = setOpeningBook(data);
  const name = process.env.REVIEW_DEMO === '1' ? 'opera' : process.env.REVIEW_DEMO!;
  const chess = new Chess();
  chess.loadPgn(GAMES[name]);
  const moves = chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
  const engines = Array.from({ length: +(process.env.POOL ?? 4) }, () => nodeEngine({ Hash: 32 }));
  const t0 = Date.now();
  const depth = +(process.env.DEPTH ?? 16);
  const review = await reviewGame(
    { startFen: new Chess().fen(), moves },
    { engines, depth, book, userColor: 'w', maxTimeMs: process.env.MAXT ? +process.env.MAXT : undefined },
  );
  console.log(`reviewed ${moves.length} plies at depth ${depth} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const m of review.moves) {
    const no = Math.floor(m.ply / 2) + 1 + (m.color === 'w' ? '.' : '...');
    console.log(
      `${no.padEnd(5)} ${m.san.padEnd(7)} ${CLASS_META[m.classification].label.padEnd(10)} loss=${m.epLoss.toFixed(3)} acc=${m.accuracy.toFixed(0).padStart(3)} | ${m.comment}`,
    );
  }
  console.log('WHITE', JSON.stringify({ ...review.white, counts: undefined }), JSON.stringify(review.white.counts));
  console.log('BLACK', JSON.stringify({ ...review.black, counts: undefined }), JSON.stringify(review.black.counts));
  console.log('OPENING', review.opening);
  console.log('SUMMARY', review.summary);
  engines.forEach((e) => e.terminate());
});
