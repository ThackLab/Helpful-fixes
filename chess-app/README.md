# Outpost Chess

A free, private, chess.com-style app that runs entirely in your browser:

- **Play bots from 250 to 3200 Elo.** 17 bots with personalities, or pick any rating. Includes clocks (bullet to classical), hints, takebacks, premoves, draw offers and a training mode with a live eval bar. One tap on the home screen starts a game against your usual opponent, or against any bot in the row below it.
- **A full game review after every game (optional, on by default).** Stockfish 18 analyses every position on all your CPU cores, then:
  - gives each player an **accuracy** score (lichess's published formula), a **game rating** estimate and phase-by-phase ratings (opening / middlegame / endgame);
  - classifies every move as **Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss or Blunder**, using chess.com's expected-points thresholds;
  - explains each move in plain English. The coach replays the engine lines and spots hanging pieces, forks and double attacks, pins, skewers, discovered attacks, mate threats and material swings, e.g. *"This allows Qg5, which makes a double attack on the knight on e5 and the pawn on g2"*;
  - draws the best-move and refutation arrows, and marks classifications on the board;
  - lets you **Retry** any mistake, replay the best line or the follow-up, and jump straight to the next mistake;
  - **Learn from this game:** a guided lesson that walks you through your costliest moments. For each one you find the better move yourself, with a two-step hint (the idea, then the piece). If you pick a wrong move, it shows the reply that punishes it. Afterwards it explains what went wrong in the game, why the better move works, and the general rule behind it;
  - **Lessons from this game:** groups your mistakes into recurring themes (hanging pieces, forks, back-rank weakness, missed recaptures, early queen moves, king safety, endgame technique and more), ranked by how many points they cost you, plus what you did well;
  - writes a game summary;
  - optionally lets you **ask an AI coach** follow-up questions in plain English (Claude, with your own Anthropic API key).
- **Learn tactics properly.** A course of short interactive lessons, each with explanations and diagrams, worked examples you step through, positions to solve and a "how to spot it" checklist:
  - **Tactics:** forks (knight, pawn, queen and royal forks), *setting up* forks (decoys, checks, removing the guard), pins, skewers, discovered attacks and double check, removing the defender, overloading, loose pieces;
  - **Checkmate patterns:** back-rank mate, smothered mate and Philidor's legacy;
  - **Endgames:** mate with the queen, mate with the rook, and king and pawn (the opposition), played out against Stockfish.
- **Puzzle trainer** with a tactics rating, themed sets (forks, pins, mates, ...), two-step hints and an explanation of every solution. If you play a wrong move, it shows the reply that refutes it.
- **Learn from your mistakes.** Every blunder, mistake and miss you make becomes a practice puzzle, scheduled with spaced repetition until you've learned it. Each puzzle has hints and the lesson it teaches. The home screen and the Learn page recommend the lesson that matches the mistakes in your recent games, and each game review links to the relevant lesson.
- **Built for phones.** On the game and review screens the board fills the width of the screen, with no navigation bar and no page scrolling, so the board never moves. The controls sit in a thumb bar at the bottom.
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

### Android app (APK)

```bash
cd chess-app
./android/build-apk.sh      # -> android/build/outpost-chess.apk
```

This needs only a JDK (17+), Node and curl; you don't need the Android SDK or Gradle. The script downloads a few pinned build tools (checksums in `android/tools.sha256`): the Android API jar, Google's d8 compiler, the aapt2 packaged inside Apktool, and uber-apk-signer. The app is a small WebView wrapper (`android/src/.../MainActivity.java`) that serves the web build straight from the APK, so it works fully offline. It adds a native bridge for saving files to *Downloads* and for the clipboard.

To install it, copy the APK to your phone, open it, and allow "install unknown apps" for your browser or file manager when Android asks.

By default the APK is signed with a public debug key, which is fine for your own phone and lets newer builds install over older ones. To use your own key, set `KEYSTORE`, `KS_PASS`, `KEY_ALIAS` and `KEY_PASS`.

### Deploy to GitHub Pages

`.github/workflows/chess-app-pages.yml` tests and builds the app on every PR and deploys it on pushes to `main`. To turn deployment on, go to *Settings → Pages → Build and deployment*, set the source to **GitHub Actions**, then re-run the workflow.

## How the bots work

- **Under 1500 Elo:** the bots model how people at that level choose moves:
  - **Sight:** each bot has a shallow search: 1 ply below 600, 2 plies up to 950, then increasingly often 3 plies until 1400. It always notices a piece left hanging, so it recaptures and saves attacked pieces, but it misses deeper tactics such as forks and pins.
  - **Judgement:** each move is judged by blending that sight with a deep Stockfish evaluation. The deep share rises with the rating.
  - **Choice:** the bot only considers moves that look about as good as its favourite (the window of moves it considers fine narrows as the rating rises), and picks among them with some noise. This produces natural inaccuracies instead of random moves.
  - **Careless moves:** now and then (more than half the time at 250, about 17% at 850, 8% at 1450) the bot plays without checking the reply: it grabs material or makes a natural-looking move. That is where hung pieces and greedy captures come from. Above 600 a careless move never costs more than about a piece (above 1000, a rook's worth).
  - **Finishing games:** when clearly winning, the bot often plays the engine's move (a third of the time at 250, most of the time at 1450), so won games get converted and mates are found.
  - The settings are a table of anchor ratings in `src/lib/bots/brain.ts`, interpolated in between.
  - **Calibration:** `BOT_CAL="250,550,850,1150,1450;10" npx vitest run src/test/botCalibrate.test.ts --silent=false` plays self-play games and reports, for balanced positions, the average centipawn loss and how often each level drops 2.5+ pawns or makes a 1–2.5 pawn mistake. Currently: 250 drops material on about a quarter of its moves, 550 on ~13%, 850 on ~5–6% (the old model: 16%), and 1450 on ~1.5%, about the same as Stockfish's own 1500 setting. `BOT_LADDER="850:1150,1450:1500;8" npx vitest run src/test/botLadder.test.ts --silent=false` plays head-to-head matches, and `BOT_DUEL="1150:1450;4" npx vitest run src/test/botDuel.test.ts --silent=false` lists each side's big mistakes.
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

## The tactics course and puzzles

- The lessons live in `src/lib/learn/curriculum.ts`. `npm test` checks that every position and move is legal. `CURRICULUM=1 npx vitest run src/test/curriculum.test.ts --silent=false` also checks each solution against Stockfish: the key move has to be the engine's best and clearly better than any alternative.
- `public/puzzles.json` holds the trainer's puzzles. They are generated offline from bot-vs-bot games: `PUZZLE_GEN="<games>,<workers>" npx vitest run src/test/puzzleGen.test.ts --silent=false`. The generator looks for positions where one side has just blundered and the other has exactly one winning continuation. It follows the engine's line for as long as your move stays the only good one, and tags each puzzle by tactic (fork, pin, skewer, discovered attack, double check, removing the defender, back-rank or smothered mate, and so on). New puzzles are merged into the file.
- `PROBE=fens.json npx vitest run src/test/probe.test.ts --silent=false` prints Stockfish's top lines for a list of positions, which helps when writing new lessons.

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
| `src/lib/learn` | the tactics course, puzzle tagging and loading, training recommendations |
| `src/lib/coach` | optional Claude-powered coach |
| `src/pages` | Home, Play, Game, Review, Learn, Lesson, Tactics, Analysis, Games, Practice, Import, Settings |
| `scripts/prepare.mjs` | copies the Stockfish WASM into `public/engine` (runs automatically before dev/build/test) |
| `scripts/build-openings.mjs` | rebuilds `public/openings.json` from `data/openings/*.tsv` |

## Credits and licences

- [Stockfish 18](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3
- [chessground](https://github.com/lichess-org/chessground), GPLv3, including the cburnett piece set
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2
- lichess [chess-openings](https://github.com/lichess-org/chess-openings), CC0

Because it bundles GPLv3 components, this app is distributed under GPL-3.0-or-later.
