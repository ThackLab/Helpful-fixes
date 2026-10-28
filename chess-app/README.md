# Outpost Chess

A free, private, chess.com-style app that runs entirely in your browser:

- **Play bots from 250 to 3200 Elo.** 17 bots with personalities, or pick any rating. Includes clocks (bullet to classical), hints, takebacks, premoves, draw offers and a training mode with a live eval bar. The Play tab opens on your usual opponent, so one tap starts a game; the strip of bots underneath switches opponent.
- **A full game review after every game (optional, on by default).** Stockfish 18 analyses every position on all your CPU cores (most of them already in the background while you play, so the review is usually ready a few seconds after the game ends), then:
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

  Every tactics lesson opens with the pattern in four parts: what it is, what to look for, how to set it up and how to stop it. Spot-it drills follow, where you tap the fork square, the pinned piece or the overloaded defender, before you solve positions.

  Lessons unlock in order. Each one ends with a practice set drawn from the puzzle bank at that level, and is graded: one star for finishing, two for 70%, three for 90% (first-try answers count; hints and retries cost points). Each level closes with a 10-puzzle exam with no hints: 8 right passes (9–10 is an A, 8 a B) and unlocks the next level, and every retake has new puzzles. A short placement test lets stronger players start further up. The You page keeps a report card per level and skill bars per tactic.
- **Strategy and endgame courses**, open from the start:
  - **Strategy:** improving your worst piece, outposts, weak pawns (isolated, backward, doubled), rooks on open files and the seventh rank, good and bad bishops, pawn breaks (hit the base of the chain, play where your pawns point), and what to trade;
  - **Endgames:** mate with queen and rook, the opposition, the square of the pawn and the Réti manoeuvre, passed pawns, the outside passed pawn, rooks behind passed pawns, the Lucena position (build a bridge) and the Philidor defence. The endings are drills against Stockfish: win it, or hold the draw for a set number of moves. A move that throws the result away ends the drill with a hint.
- **Opening repertoire trainer.** Pick your openings (Italian, Ruy Lopez, Scotch, Queen's Gambit and London for White; 1...e5, Sicilian, French, Caro-Kann and Scandinavian against 1.e4; Queen's Gambit Declined, Slav and King's Indian against 1.d4) and drill them line by line: you play your side's moves, the app plays the replies, and a wrong move shows the right one. Lines come back with spaced repetition, sooner after a mistake. Each game review says where the game left your repertoire, and whether you or your opponent went off the line.
- **Puzzles.** About 1,200 puzzles, rated by how often the human-like bots solve them: classic collections (Reinfeld's *Win at Chess*, combinations from the *Encyclopedia of Chess Middlegames*, mate problems, positions from Lichess games) and puzzles mined from engine games, each with its source shown. A rated mode whose rating adapts as you solve, themed sets (free pieces, mates in 1–3, forks, pins, skewers, discovered attacks, removing the defender, sacrifices, combinations, promotion...) with your accuracy on each, and **Puzzle Rush**: 3 minutes, 3 lives, each puzzle a little harder than the last. Every puzzle has a single winning solution checked by Stockfish, two-step hints and an explanation; a wrong move shows the reply that refutes it. Once a puzzle is done, **See the idea** redraws the starting position with the key move and arrows to what it attacks. Puzzle ratings come from the bots, not from human solvers, so they are on their own scale; the Puzzles page says so.
- **A plan for today.** The home screen builds a short daily plan from what you need most: the mistakes due for review, puzzles on your weakest theme, the next lesson, openings that are due, and a game. Each item ticks off as you do it.
- **Insights.** Across your reviewed games: where your points go by phase, which patterns cost you most (with the lesson for each), how often you convert winning positions and come back from losing ones, time trouble, your openings, and this month against last.
- **Coach during games (optional).** In untimed games against a bot, the coach checks each move before the bot replies. If it loses a lot, it warns you and says what it allows (the same explanations as the game review), and you can take it back or play it anyway. It also points out when the bot slips. Coached games are not rated.
- **Play a friend.** Pass and play on one device (with clocks and an auto-flipping board if you like), or play by link: each move is sent as a link that holds the whole game, and your friend answers with a link back. No account and no server. Finished games go into your library for review.
- **Learn from your mistakes.** Every blunder, mistake and miss you make becomes a practice puzzle, scheduled with spaced repetition until you've learned it. Each puzzle has hints and the lesson it teaches. The home screen and the Learn page recommend the lesson that matches the mistakes in your recent games, and each game review links to the relevant lesson.
- **Ten themes, built for phones.** Noir (the default: black, with colour only for right and wrong), Graphite, Club, Walnut, Ocean, Royal, Rose, Paper, High contrast and Visual aid. Each theme sets its own colours, fonts, board and pieces, and you can mix: 14 boards, 12 piece sets, text size, colour-blind safe colours for right and wrong, square names drawn on every square, reduced motion, and figurines or letters in move notation. Visual aid uses a font made for low vision (Atkinson Hyperlegible), bigger text and square names on the board. Moves in the text are set as chips with piece figurines, key words in an accent, numbers count up. Four tabs: Play, Puzzles, Learn and You. On the board screens (games, reviews, lessons, puzzles) the board fills the width of the screen, with no navigation bar and no page scrolling, so the board never moves; the controls sit in a thumb bar at the bottom.
- **Analysis board.** Variation tree, 1–5 engine lines with arrows, threat view, PGN import (variations, comments and NAGs are kept), FEN import, position editor, PGN export, and one-click full review of the main line.
- **Review your chess.com and lichess games for free.** Import recent games by username, or paste or upload any PGN, including multi-game files.
- Game library, rating graph, opening stats, backup and restore, with a reminder to back up once you have games worth keeping. Installs as a PWA and keeps working offline once loaded.

Nothing is sent to a server: games, reviews and puzzles live in your browser's IndexedDB. The only network requests are the chess.com/lichess import and, if you turn it on, the AI coach. Games by link travel in the links themselves.

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

### iPhone and iPad

There is no App Store build: on iOS the app runs as a web app. Open the deployed site (see below; for this repo https://thacklab.github.io/Helpful-fixes/) in **Safari**, tap **Share → Add to Home Screen**, and open it from the new icon. It then runs full screen and works offline. Games, reviews and puzzle progress are kept on the device; iOS keeps a home-screen app's storage, but may clear a site's storage that is only used in a Safari tab and not opened for a few weeks.

### Deploy to GitHub Pages

`.github/workflows/chess-app-pages.yml` tests and builds the app on every PR and deploys it on pushes to `main`. To turn deployment on, go to *Settings → Pages → Build and deployment*, set the source to **GitHub Actions**, then re-run the workflow.

## How the bots work

- **Under 1500 Elo:** the bots model what a player at that level *notices*. Weaker players rarely lose because they calculate a little worse on every move. They lose because they don't see things: the piece you just left hanging, the threat to their own knight, the check that wins. So each turn the bot only considers the moves it noticed:
  - **Noticing:** each enemy piece it could win is either spotted or missed (38% chance to spot at 250, 58% at 850, 80% at 1450), and so is each attack on one of its own pieces (60% / 80% / 93%). It also considers recaptures, some checks, castling, a handful of ordinary moves, and sometimes the engine's best move. A move it didn't notice is never played, so a 250 bot really does walk past a free queen now and then.
  - **Judging:** it compares the moves it noticed with a one-move look (it sees what can be taken straight back), blended with Stockfish's deep evaluation at higher ratings, plus some judgement noise. Now and then it judges a move without looking at the reply; that is where greedy captures of defended pieces come from.
  - **Finishing games:** when clearly winning, it sometimes plays the engine's move (15% of the time at 250, 78% at 1450), so won games get converted without low-rated bots converting like machines.
  - The settings are a table of anchor ratings in `src/lib/bots/brain.ts`, interpolated in between.
  - **Measuring:** `BOT_SEE="250,550,850,1150,1450;2" npx vitest run src/test/botPerception.test.ts --silent=false` puts each level in the puzzle positions just after a piece was left hanging, and reports how often it wins that piece and, with colours swapped, how often it saves its own. Currently 250 punishes 48% and saves 59%, 550 62% / 70%, 850 75% / 80%, 1150 86% / 85%, 1450 93% / 91%. `BOT_CAL="250,550,850,1150,1450;8" npx vitest run src/test/botCalibrate.test.ts --silent=false` plays self-play games and reports, for balanced positions, how often each level gives away 2.5+ pawns (250: ~6% of its moves, 850: ~3.5%, 1450: ~1.7%), makes a 1–2.5 pawn mistake (250: ~20%, 850: ~8%, 1450: ~2%) or misses a winning capture. `BOT_LADDER="850:1150,1450:1500;8" npx vitest run src/test/botLadder.test.ts --silent=false` plays head-to-head matches, and `BOT_DUEL="1150:1450;4" npx vitest run src/test/botDuel.test.ts --silent=false` lists each side's big mistakes.
- **1500–3190:** Stockfish's `UCI_LimitStrength` / `UCI_Elo`. Its scale is calibrated against engines at long time controls, and at the app's speed its low settings play weaker than labelled, so the app passes a slightly higher `UCI_Elo` at the low end (+230 at 1500, fading out by 2300; see `stockfishEloFor`). With that, the 1450 human-model bot scores 44% against 1500 and 38% against 1600 over 16 games.
- **3200:** full-strength Stockfish.
- Bots open from an opening book of 3,300+ named lines, so their openings vary from game to game.

Bot-vs-bot matches can be run with `BOT_MATCH="1000,1300,10" npx vitest run src/test/botMatch.test.ts --silent=false`.

## How the review works

1. Every position is analysed at a fixed depth (Fast 12 / Standard 16 / Deep 20) with three engine lines. A consistency pass re-analyses deeper any position whose evaluation contradicts its neighbour's. To make this fast without lowering the depth:
   - **While you play**, a separate single-threaded engine analyses the game's positions at the review depth, newest first, and stores them in an IndexedDB cache (`src/state/liveAnalysis.ts`, `src/lib/review/evalCache.ts`). The review only searches the positions it doesn't find there. It can be turned off in Settings ("Analyse while you play").
   - Building the review from the evaluations (classification, coach text, tactics detection) takes a fraction of a second: the static exchange evaluator works on a plain board array instead of chess.js move generation.
   - `REVIEW_SPEED="<games>" npx vitest run src/test/reviewSpeed.test.ts --silent=false` plays bot games, simulates the background analysis, and compares the review from that cache, a review from scratch and a second review from scratch with a review 4 plies deeper. On 4 bot games (213 moves), the review from the cache took 0.7s in all against 61s from scratch, and matched the deeper review just as well: 39 moves classified differently from it, the same as from scratch (a second review from scratch: 41). The background analysis needed 0.8s a move on one thread, so it keeps up with normal play.
2. Evaluations are converted to expected points with lichess's logistic model. Each move's loss decides its class: ≤0.02 Excellent, ≤0.05 Good, ≤0.10 Inaccuracy, ≤0.20 Mistake, otherwise Blunder. The engine's own move is Best.
3. The special classes:
   - **Brilliant:** a sound sacrifice of at least two points that is the best move, in a position that wasn't already completely winning.
   - **Great:** the only move that keeps the evaluation, or one that punishes an opponent's mistake.
   - **Miss:** failing to cash in on a mistake or tactic without actually spoiling the position.
   - **Book:** follows the lichess opening database.
4. The coach text comes from static tactics detection (legal-move SEE, forks, pins, skewers, discovered attacks, mate threats) combined with the material balance along the engine's lines.

`REVIEW_DEMO=1 npx vitest run src/test/reviewDemo.test.ts --silent=false` prints a full review of Morphy's Opera Game in the terminal.

## The course and the puzzles

- **Levels** are defined in `src/lib/learn/levels.ts` (lessons, exam themes and rating band per level, the unlocking rules and grading), and the strategy and endgame courses in `src/lib/learn/courses.ts`. The lessons live in `src/lib/learn/curriculum.ts`, `lessons2.ts`, `strategy.ts` and `endgames.ts`. `npm test` checks that every position and move is legal and that the courses hang together (every lesson belongs to a level or a course, every link points at a real lesson). `CURRICULUM=1 npx vitest run src/test/curriculum.test.ts --silent=false` also checks the lessons against Stockfish: a puzzle's key move has to be the engine's best and clearly better than any alternative; a quiz's right answers have to be within half a pawn of the best move and its wrong answers clearly worse than the right ones; a drill has to start from a won position (or, to hold, a drawn one).
- **Opening repertoires** (`public/repertoires.json`) are built offline: `REPERTOIRE=1 npx vitest run src/test/repertoireBuild.test.ts --silent=false`. From each opening's starting moves, your side plays one move in every position: the most popular book move among those Stockfish rates within a quarter of a pawn of the best (system openings like the London follow their usual set-up when it is about as good). The other side plays its main book replies, wide near the start and narrower later, with Stockfish's main replies added where the book is thin, and past the book both sides play Stockfish's moves, so every line runs 12 moves past the starting moves.
- **Puzzles** (`public/puzzles.json`) are mined offline from engine games: `PUZZLE_GEN="<games>,<workers>" npx vitest run src/test/puzzleGen.test.ts --silent=false`. Each game is played by a deliberately sloppy engine (it picks among its top moves, more loosely in some games than others). At every position, each plausible mistake - one of the engine's top 12 moves that throws away 2.5+ pawns - is tried as a puzzle start. It becomes a puzzle only if the reply is the single move that wins, and the line continues for as long as the solver's move stays unique. Puzzles are tagged by tactic (fork, pin, skewer, discovered attack, double check, removing the defender, back-rank or smothered mate, sacrifice, promotion and so on). Plain captures of a hanging piece are by far the commonest find, so most of them are skipped.
- **Classic puzzles** come from the files in `data/sources` (see its README): `PUZZLE_IMPORT="<workers>" npx vitest run src/test/puzzleImport.test.ts --silent=false` checks every position with Stockfish and keeps it only if the book move is the engine's best, it is clearly better than the second-best move, and it wins (forced mate, or at least two points of material). Mates use the engine's mating line; other puzzles continue for as long as the solver's move stays unique. The result goes to `data/puzzles-real.json`.
- **Puzzle ratings** come from the bots: `PUZZLE_RATE="<workers>" npx vitest run src/test/puzzleRate.test.ts --silent=false` lets the human-like bots from 300 to 1900 try every puzzle twice, and rates it where a bot solves it about half the time (a logistic fit, with a heuristic estimate as a weak prior). The level exams and practice sets draw from these ratings. `PUZZLE_BANK=1 npx vitest run src/test/puzzleBank.test.ts` builds `public/puzzles.json` from the imported and mined puzzles. `PUZZLE_DIR=<dir>` points the import, mining and rating runs at another folder, so long runs don't touch `data/`.
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
| `src/lib/learn` | levels, courses and grading, the lessons, repertoires, puzzle tagging and loading, today's plan, training recommendations |
| `src/lib/coach` | the in-game blunder check, and the optional Claude-powered coach |
| `src/pages` | Home (play and today's plan), Puzzles, PuzzleSession, Rush, Learn, Lesson, Exam, Openings, Insights, Friend, You, Appearance, Play (options), Game, Review, Analysis, Games, Practice, Import, Settings |
| `scripts/prepare.mjs` | copies the Stockfish WASM into `public/engine` (runs automatically before dev/build/test) |
| `scripts/build-openings.mjs` | rebuilds `public/openings.json` from `data/openings/*.tsv` |

## Credits and licences

- [Stockfish 18](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3
- [chessground](https://github.com/lichess-org/chessground), GPLv3, including the cburnett piece set
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2
- lichess [chess-openings](https://github.com/lichess-org/chess-openings), CC0
- Puzzle positions from the [sunfish](https://github.com/thomasahle/sunfish) test files (*Win at Chess*, Lichess game positions, mate problems), GPLv3, and the [Arasan](https://github.com/jdart1/arasan-chess) *Encyclopedia of Chess Middlegames* test suite, MIT
- [lucide](https://lucide.dev/) icons, ISC
- Fonts via [Fontsource](https://fontsource.org/), all OFL: [Inter](https://rsms.me/inter/), Instrument Serif, Fraunces, Newsreader, JetBrains Mono, and Atkinson Hyperlegible Next (Braille Institute)
- Piece sets from [lichess](https://github.com/lichess-org/lila/tree/master/public/piece), each under its own licence (GPL, MIT, Apache 2.0, CC BY 4.0 or CC0); authors in `public/pieces/README.md` and on the Appearance page

Because it bundles GPLv3 components, this app is distributed under GPL-3.0-or-later.
