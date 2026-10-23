# Outpost Chess

A free, private, chess.com-style app that runs entirely in your browser:

- **Play bots from 250 to 3200 Elo.** 17 bots with personalities, or pick any rating. Includes clocks (bullet to classical), hints, takebacks, premoves, draw offers and a training mode with a live eval bar.
- **A full game review after every game (optional, on by default).** Stockfish 18 analyses every position on all your CPU cores, then:
  - gives each player an **accuracy** score (lichess's published formula), a **game rating** estimate and phase-by-phase ratings (opening / middlegame / endgame);
  - classifies every move as **Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss or Blunder**, using chess.com's expected-points thresholds;
  - explains each move in plain English. The coach replays the engine lines and spots hanging pieces, forks and double attacks, pins, skewers, discovered attacks, mate threats and material swings, e.g. *"This allows Qg5, which makes a double attack on the knight on e5 and the pawn on g2"*;
  - draws the best-move and refutation arrows, and marks classifications on the board;
  - lets you **Retry** any mistake, replay the best line or the follow-up, and jump straight to the next mistake;
  - writes a game summary with personalised tips;
  - optionally lets you **ask an AI coach** follow-up questions in plain English (Claude, with your own Anthropic API key).
- **Learn from your mistakes.** Every blunder, mistake and miss you make becomes a practice puzzle, scheduled with spaced repetition until you've learned it.
- **Analysis board.** Variation tree, 1–5 engine lines with arrows, threat view, PGN import (variations, comments and NAGs are kept), FEN import, position editor, PGN export, and one-click full review of the main line.
- **Review your chess.com and lichess games for free.** Import recent games by username, or paste or upload any PGN, including multi-game files.
- Game library, rating graph, opening stats, backup and restore. Installs as a PWA and keeps working offline once loaded.

Nothing is sent to a server: games, reviews and puzzles live in your browser's IndexedDB. The only network requests are the chess.com/lichess import and, if you turn it on, the AI coach.

## Run it

```bash
cd chess-app
npm install
npm run dev        # http://localhost:5173
```

`npm run build` produces a static site in `dist/` that you can host anywhere. `npm run preview` serves that build locally.

The dev and preview servers send cross-origin-isolation headers, so the analysis board uses the multi-threaded engine. On hosts that can't send those headers (e.g. GitHub Pages), it falls back to the single-threaded engine automatically. Game reviews always run several engines in parallel.

### Deploy to GitHub Pages

`.github/workflows/chess-app-pages.yml` tests and builds the app on every PR and deploys it on pushes to `main`. To turn deployment on, go to *Settings → Pages → Build and deployment*, set the source to **GitHub Actions**, then re-run the workflow.

## How the bots work

- **Under 1500 Elo:** Stockfish scores up to 40 candidate moves with a shallow search. The bot then picks one with a temperature that grows as the rating drops, plus occasional "careless" moves weighted towards natural-looking captures, checks and pushes. Weak bots therefore hang pieces and miss tactics the way people do, but still convert won endgames.
- **1500–3190:** Stockfish's own calibrated `UCI_LimitStrength` / `UCI_Elo`.
- **3200:** full-strength Stockfish.
- Bots open from an opening book of 3,300+ named lines, so their openings vary from game to game.

Bot-vs-bot matches can be run with `BOT_MATCH="1000,1300,10" npx vitest run src/test/botMatch.test.ts --silent=false`.

## How the review works

1. Every position is analysed at a fixed depth (Fast 12 / Standard 16 / Deep 20) with three engine lines. A consistency pass re-analyses deeper any position whose evaluation contradicts its neighbour's.
2. Evaluations are converted to expected points with lichess's logistic model. Each move's loss decides its class: ≤0.02 Excellent, ≤0.05 Good, ≤0.10 Inaccuracy, ≤0.20 Mistake, otherwise Blunder. The engine's own move is Best.
3. The special classes:
   - **Brilliant:** a sound sacrifice of at least two points that is the best move, in a position that wasn't already completely winning.
   - **Great:** the only move that keeps the evaluation, or one that punishes an opponent's mistake.
   - **Miss:** failing to cash in on a mistake or tactic without actually spoiling the position.
   - **Book:** follows the lichess opening database.
4. The coach text comes from static tactics detection (legal-move SEE, forks, pins, skewers, discovered attacks, mate threats) combined with the material balance along the engine's lines.

`REVIEW_DEMO=1 npx vitest run src/test/reviewDemo.test.ts --silent=false` prints a full review of Morphy's Opera Game in the terminal.

## Development

```bash
npm test           # unit tests (engine, PGN, tactics, classification)
npm run typecheck
npm run format
```

Project layout:

| Path | What |
| --- | --- |
| `src/lib/engine` | UCI protocol, the promise-based `Engine` wrapper, the worker pool |
| `src/lib/review` | win probability, accuracy, classification, coach explanations, the review pipeline |
| `src/lib/chess` | PGN tree parser/writer, tactics detection, opening book |
| `src/lib/bots` | bot roster and move selection |
| `src/lib/coach` | optional Claude-powered coach |
| `src/pages` | Home, Play, Game, Review, Analysis, Games, Practice, Import, Settings |
| `scripts/prepare.mjs` | copies the Stockfish WASM into `public/engine` (runs automatically before dev/build/test) |
| `scripts/build-openings.mjs` | rebuilds `public/openings.json` from `data/openings/*.tsv` |

## Credits and licences

- [Stockfish 18](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3
- [chessground](https://github.com/lichess-org/chessground), GPLv3, including the cburnett piece set
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2
- lichess [chess-openings](https://github.com/lichess-org/chess-openings), CC0

Because it bundles GPLv3 components, this app is distributed under GPL-3.0-or-later.
