# Puzzle sources

Positions imported by `src/test/puzzleImport.test.ts`. Every one is re-checked
by Stockfish (the book move must be the engine's best and clearly better than
the alternatives), so only a share of each file ends up in the puzzle bank.

| File | What | From |
| --- | --- | --- |
| `win_at_chess_test.epd` | Fred Reinfeld's *Win at Chess* (300 combinations) | [sunfish](https://github.com/thomasahle/sunfish) `tests/files`, GPLv3 |
| `lichess_blunders.epd` | positions from Lichess games where one move wins | sunfish `tests/files`, GPLv3 |
| `mate1.fen` … `mate4.fen` | mate in 1 to 4 problems | sunfish `tests/files`, GPLv3 |
| `ecmgcp.epd` | combinations from the *Encyclopedia of Chess Middlegames* | [Arasan](https://github.com/jdart1/arasan-chess) `tests/ecmgcp.epd`, MIT |
