# Outpost Chess

A free, private, chess.com-style app that runs entirely in your browser:

- **Play bots from 250 to 3200 Elo.** 17 bots with personalities, or pick any rating. Includes clocks (bullet to classical), hints, takebacks, premoves, draw offers and a training mode with a live eval bar. The Play tab opens on your usual opponent, so one tap starts a game; the strip of bots underneath switches opponent.
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
- **A graded course.** Five levels, from Beginner to Advanced, each a short run of interactive lessons (explanations with diagrams, worked examples you step through, positions to solve, quizzes, and endgames played out against Stockfish):
  - **1 Beginner:** piece values, loose pieces, saving your pieces, checks-captures-threats, back-rank mate;
  - **2 Novice:** forks, pins, skewers, opening principles, mate with the queen;
  - **3 Intermediate:** discovered attacks and double check, removing the defender, setting up forks, smothered mate, mate with the rook;
  - **4 Club player:** overloading, deflection and interference, passed pawns, mating nets, the opposition;
  - **5 Advanced:** attacking the king (the Greek gift and sacrifices on h2/h7), calculating forcing lines to the end.
  
  Lessons unlock in order. Each one ends with a practice set drawn from the puzzle bank at that level, and is graded: one star for finishing, two for 70%, three for 90% (first-try answers count; hints and retries cost points). Each level closes with a 10-puzzle exam with no hints: 8 right passes (9–10 is an A, 8 a B) and unlocks the next level, and every retake has new puzzles. A short placement test lets stronger players start further up. The You page keeps a report card per level and skill bars per tactic.
- **Puzzles.** About 1,000 puzzles, rated by how often the human-like bots solve them. A rated mode whose rating adapts as you solve, themed sets (free pieces, mates in 1–3, forks, pins, skewers, discovered attacks, removing the defender, sacrifices, combinations, promotion...) with your accuracy on each, and **Puzzle Rush**: 3 minutes, 3 lives, each puzzle a little harder than the last. Every puzzle has a single winning solution checked by Stockfish, two-step hints and an explanation; a wrong move shows the reply that refutes it.
- **Learn from your mistakes.** Every blunder, mistake and miss you make becomes a practice puzzle, scheduled with spaced repetition until you've learned it. Each puzzle has hints and the lesson it teaches. The home screen and the Learn page recommend the lesson that matches the mistakes in your recent games, and each game review links to the relevant lesson.
- **Simple, and built for phones.** Four tabs: Play, Puzzles, Learn and You. Play opens straight on your opponent with one big Play button. On the board screens (games, reviews, lessons, puzzles) the board fills the width of the screen, with no navigation bar and no page scrolling, so the board never moves; the controls sit in a thumb bar at the bottom.
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

- **Under 1500 Elo:** the bots model what a player at that level *notices*. Weaker players rarely lose because they calculate a little worse on every move. They lose because they don't see things: the piece you just left hanging, the threat to their own knight, the check that wins. So each turn the bot only considers the moves it noticed:
  - **Noticing:** each enemy piece it could win is either spotted or missed (38% chance to spot at 250, 58% at 850, 80% at 1450), and so is each attack on one of its own pieces (60% / 80% / 93%). It also considers recaptures, some checks, castling, a handful of ordinary moves, and sometimes the engine's best move. A move it didn't notice is never played, so a 250 bot really does walk past a free queen now and then.
  - **Judging:** it compares the moves it noticed with a one-move look (it sees what can be taken straight back), blended with Stockfish's deep evaluation at higher ratings, plus some judgement noise. Now and then it judges a move without looking at the reply; that is where greedy captures of defended pieces come from.
  - **Finishing games:** when clearly winning, it sometimes plays the engine's move (15% of the time at 250, 78% at 1450), so won games get converted without low-rated bots converting like machines.
  - The settings are a table of anchor ratings in `src/lib/bots/brain.ts`, interpolated in between.
  - **Measuring:** `BOT_SEE="250,550,850,1150,1450;2" npx vitest run src/test/botPerception.test.ts --silent=false` puts each level in the puzzle positions just after a piece was left hanging, and reports how often it wins that piece and, with colours swapped, how often it saves its own. Currently 250 punishes 52% and saves 64%, 550 64% / 70%, 850 83% / 76%, 1150 89% / 82%, 1450 97% / 87%. `BOT_CAL="250,550,850,1150,1450;8" npx vitest run src/test/botCalibrate.test.ts --silent=false` plays self-play games and reports, for balanced positions, how often each level gives away 2.5+ pawns (250: ~6% of its moves, 850: ~3.5%, 1450: ~1.7%), makes a 1–2.5 pawn mistake (250: ~20%, 850: ~8%, 1450: ~2%) or misses a winning capture. `BOT_LADDER="850:1150,1450:1500;8" npx vitest run src/test/botLadder.test.ts --silent=false` plays head-to-head matches, and `BOT_DUEL="1150:1450;4" npx vitest run src/test/botDuel.test.ts --silent=false` lists each side's big mistakes.
- **1500–3190:** Stockfish's `UCI_LimitStrength` / `UCI_Elo`. Its scale is calibrated against engines at long time controls, and at the app's speed its low settings play weaker than labelled, so the app passes a slightly higher `UCI_Elo` at the low end (+230 at 1500, fading out by 2300; see `stockfishEloFor`). With that, the 1450 human-model bot scores 44% against 1500 and 38% against 1600 over 16 games.
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

## The course and the puzzles

- **Levels** are defined in `src/lib/learn/levels.ts` (lessons, exam themes and rating band per level, the unlocking rules and grading). The lessons live in `src/lib/learn/curriculum.ts` and `src/lib/learn/lessons2.ts`. `npm test` checks that every position and move is legal and that the course hangs together (every lesson belongs to a level, every link points at a real lesson). `CURRICULUM=1 npx vitest run src/test/curriculum.test.ts --silent=false` also checks each solution against Stockfish: the key move has to be the engine's best and clearly better than any alternative.
- **Puzzles** (`public/puzzles.json`) are mined offline from engine games: `PUZZLE_GEN="<games>,<workers>" npx vitest run src/test/puzzleGen.test.ts --silent=false`. Each game is played by a deliberately sloppy engine (it picks among its top moves, more loosely in some games than others). At every position, each plausible mistake - one of the engine's top 12 moves that throws away 2.5+ pawns - is tried as a puzzle start. It becomes a puzzle only if the reply is the single move that wins, and the line continues for as long as the solver's move stays unique. Puzzles are tagged by tactic (fork, pin, skewer, discovered attack, double check, removing the defender, back-rank or smothered mate, sacrifice, promotion and so on). Plain captures of a hanging piece are by far the commonest find, so most of them are skipped.
- **Puzzle ratings** come from the bots: `PUZZLE_RATE="<workers>" npx vitest run src/test/puzzleRate.test.ts --silent=false` lets the human-like bots from 300 to 1900 try every puzzle twice, and rates it where a bot solves it about half the time (a logistic fit, with a heuristic estimate as a weak prior). The level exams and practice sets draw from these ratings.
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
| `src/lib/learn` | levels and grading, the lessons, puzzle tagging and loading, training recommendations |
| `src/lib/coach` | optional Claude-powered coach |
| `src/pages` | Home (play), Puzzles, PuzzleSession, Rush, Learn, Lesson, Exam, You, Play (options), Game, Review, Analysis, Games, Practice, Import, Settings |
| `scripts/prepare.mjs` | copies the Stockfish WASM into `public/engine` (runs automatically before dev/build/test) |
| `scripts/build-openings.mjs` | rebuilds `public/openings.json` from `data/openings/*.tsv` |

## Credits and licences

- [Stockfish 18](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3
- [chessground](https://github.com/lichess-org/chessground), GPLv3, including the cburnett piece set
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2
- lichess [chess-openings](https://github.com/lichess-org/chess-openings), CC0

Because it bundles GPLv3 components, this app is distributed under GPL-3.0-or-later.
