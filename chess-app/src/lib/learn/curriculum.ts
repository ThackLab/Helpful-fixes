// The tactics course: short interactive lessons. Every position is checked
// against Stockfish by src/test/curriculum.test.ts.
import type { PuzzleTheme } from './tags';
import { EXTRA_LESSONS } from './lessons2';

/** Arrows are UCI-style square pairs, optionally prefixed with a brush: "r:" red, "b:" blue, "y:" yellow (default green). */
export interface InfoStep {
  kind: 'info';
  title: string;
  text: string;
  fen: string;
  arrows?: string[];
  marks?: string[];
}

/** A narrated sequence: each "Next" plays one move. */
export interface WalkStep {
  kind: 'walk';
  title: string;
  text: string;
  fen: string;
  moves: { uci: string; text: string; arrows?: string[] }[];
}

/** Find the move(s). `line` alternates your moves and the replies, starting and ending with yours. */
export interface PuzzleStep {
  kind: 'puzzle';
  title: string;
  text: string;
  fen: string;
  line: string[];
  hint: string;
  success: string;
  /** Other first moves that also win; accepted with a note. */
  alts?: string[];
  /** Any checkmate counts as solving the final move. */
  anyMate?: boolean;
}

/** Play it out against Stockfish. */
export interface DrillStep {
  kind: 'drill';
  title: string;
  text: string;
  fen: string;
  goal: 'mate' | 'promote';
  /** Moves allowed before the drill counts as failed. */
  maxMoves: number;
  success: string;
}

/** Multiple choice. Options with a move show it on the board when picked. */
export interface QuizStep {
  kind: 'quiz';
  title: string;
  text: string;
  fen: string;
  options: { label: string; uci?: string; correct?: boolean; why: string; arrows?: string[] }[];
}

/** The tactic in four parts, shown at the start of a tactics lesson. */
export interface PatternStep {
  kind: 'pattern';
  title: string;
  fen: string;
  arrows?: string[];
  marks?: string[];
  /** What it is. */
  what: string;
  /** What to look for on the board. */
  cue: string;
  /** How to make it happen. */
  setup: string;
  /** How to stop it being done to you. */
  defend: string;
}

/** Spot the pattern: tap the right square (the fork square, the pinned piece...). */
export interface TapStep {
  kind: 'tap';
  title: string;
  text: string;
  fen: string;
  /** Squares that count as right. */
  answers: string[];
  success: string;
  /** Shown once it is solved. */
  arrows?: string[];
}

export type LessonStep = InfoStep | WalkStep | PuzzleStep | DrillStep | QuizStep | PatternStep | TapStep;

export interface Lesson {
  id: string;
  group: 'Basics' | 'Tactics' | 'Checkmate patterns' | 'Openings' | 'Endgames';
  title: string;
  icon: string;
  summary: string;
  /** One-line takeaway. */
  rule: string;
  /** How to spot it in your games. */
  spot: string[];
  /** Generated practice puzzles with these themes. */
  themes: PuzzleTheme[];
  steps: LessonStep[];
}

const BASE_LESSONS: Lesson[] = [
  {
    id: 'cct',
    group: 'Tactics',
    title: 'Checks, captures, threats',
    icon: '🔎',
    summary: 'The habit that finds tactics and stops blunders.',
    rule: 'Look at checks, captures and threats first, for both sides, before every move.',
    spot: [
      'Every move: list your checks, then your captures, then moves that attack something.',
      'After every opponent move: what does it attack, and what did it stop defending?',
      'Before you press: which of your pieces will be undefended after your move?',
    ],
    themes: ['mateIn1', 'mateIn2', 'hanging'],
    steps: [
      {
        kind: 'info',
        title: 'Forcing moves first',
        text: 'Strong players don’t look at every move. They start with the forcing ones, because those leave the opponent few replies, so you can calculate them: first checks, then captures, then threats (moves that attack something). Here White’s queen and bishop both aim at f7, which only the king defends.',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        arrows: ['h5f7', 'c4f7'],
        marks: ['f7'],
      },
      {
        kind: 'puzzle',
        title: 'Start with the checks',
        text: 'White to move. Black has just played ...Nf6, ignoring the threat. Which forcing move wins?',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        line: ['h5f7'],
        anyMate: true,
        hint: 'Which of your moves is both a check and a capture?',
        success: 'Qxf7# is a check and a capture at once: Scholar’s mate. Black’s ...Nf6 developed a piece but missed what White was threatening.',
      },
      {
        kind: 'quiz',
        title: 'What does their move threaten?',
        text: 'Black has just played ...Qg5. What is it threatening?',
        fen: 'r1b1kbnr/pppp1ppp/8/4N1q1/2BnP3/8/PPPP1PPP/RNBQK2R w KQkq - 1 5',
        options: [
          { label: 'Only ...Qxg2, going after the rook on h1', why: 'That is one threat, but follow the queen’s other lines too.' },
          {
            label: 'Two things: ...Qxe5 and ...Qxg2',
            correct: true,
            why: 'The queen attacks the knight on e5 and the pawn on g2 at once: a double attack. White can’t meet both, so the previous move Nxe5? was the real mistake, because it walked into this fork.',
            arrows: ['r:g5e5', 'r:g5g2'],
          },
          { label: 'Nothing: it’s just developing the queen', why: 'Always ask what the last move attacks. Here the queen hits two things.' },
        ],
      },
      {
        kind: 'info',
        title: 'The ten-second blunder check',
        text: 'Before you move, ask three questions. What did their last move change: is anything of mine attacked now? After my move, which of my pieces are undefended? Can they answer with a check, a capture or a fork? It takes ten seconds, and it saves most games lost below 1500.',
        fen: 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R w KQkq - 0 6',
      },
    ],
  },
  {
    id: 'forks',
    group: 'Tactics',
    title: 'Forks',
    icon: '🍴',
    summary: 'One piece attacks two. Knight, queen, pawn and royal forks.',
    rule: 'Before every move, look for a square where one of your pieces would attack two enemy pieces at once.',
    spot: [
      'Two valuable enemy pieces (king, queen, rooks) a knight’s jump from the same square.',
      'A queen check that also hits a loose piece.',
      'Two enemy pieces side by side in front of your pawns.',
    ],
    themes: ['fork'],
    steps: [
      {
        kind: 'info',
        title: 'What is a fork?',
        text: 'A fork is one piece attacking two or more enemy pieces at the same time. Your opponent can only save one of them. Here the knight checks the king and attacks the rook: once the king moves, Nxa8 wins the rook. Forks that include a check are the strongest kind, because the opponent has no time to protect the other piece.',
        fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1',
        arrows: ['r:c7e8', 'r:c7a8'],
      },
      {
        kind: 'info',
        title: 'Every piece can fork',
        text: 'The queen forks in eight directions: a queen check that also hits a loose piece is one of the most common ways to win material. Pawns fork two pieces diagonally, which is easy to overlook. Bishops and rooks fork along their lines, and in the endgame even the king can fork. Here Qa4+ checks the king and attacks the bishop on h4 along the rank.',
        fen: '4k3/8/8/8/Q6b/8/8/2K5 b - - 0 1',
        arrows: ['r:a4e8', 'r:a4h4'],
      },
      {
        kind: 'info',
        title: 'Why knights fork best',
        text: 'A knight attacks up to eight squares, and its attacks can’t be blocked. It can attack a queen or a rook without being attacked back, because those pieces don’t move like a knight. To find knight forks, look for two valuable enemy pieces that are a knight’s jump from the same square: that square is the fork square.',
        fen: '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1',
        marks: ['b5', 'c6', 'e6', 'f5', 'f3', 'e2', 'c2', 'b3'],
      },
      {
        kind: 'puzzle',
        title: 'Royal fork',
        text: 'White to move. The black king and queen are a knight’s jump from the same square.',
        fen: 'r5k1/pb3ppp/1pq5/3N4/8/8/PP3PPP/R2Q2K1 w - - 0 1',
        line: ['d5e7', 'g8h8', 'e7c6'],
        hint: 'Which square does the knight attack both g8 and c6 from?',
        success: 'Ne7+ forks the king and the queen. After the king steps aside, Nxc6 wins the queen for a knight.',
      },
      {
        kind: 'puzzle',
        title: 'Pawn fork',
        text: 'White to move. Black’s bishop and knight stand side by side.',
        fen: 'r1bq1rk1/ppp2ppp/3b1n2/8/3PP3/2NB4/1P3PPP/R1BQ1RK1 w - - 0 1',
        line: ['e4e5'],
        hint: 'Your cheapest piece can attack both of them.',
        success: 'e5 attacks the bishop on d6 and the knight on f6 at once, and the d4 pawn protects it. Black will lose a piece for a pawn.',
      },
      {
        kind: 'puzzle',
        title: 'Queen fork',
        text: 'White to move. The bishop on h4 has no defender.',
        fen: 'r2qk2r/ppp4p/4ppp1/8/7b/2P5/PP3PPP/R1BQ1RK1 w kq - 0 1',
        line: ['d1a4', 'e8f7', 'a4h4'],
        hint: 'Look for a check that also attacks h4.',
        success: 'Qa4+ checks along the diagonal and attacks h4 along the rank. After Black deals with the check, Qxh4 collects the loose bishop.',
      },
      {
        kind: 'puzzle',
        title: 'Check and fork',
        text: 'White to move. Your knight is attacked twice. Use it before you lose it.',
        fen: '2r3k1/pp3ppp/4b3/q2N4/8/8/PP3PPP/3Q1RK1 w - - 0 1',
        line: ['d5e7', 'g8f8', 'e7c8'],
        hint: 'A knight check that also hits the rook.',
        success:
          'Ne7+ escapes with a fork of the king and the rook on c8. Attacked pieces often have a forcing move: look for checks before retreating.',
      },
      {
        kind: 'puzzle',
        title: 'Family fork',
        text: 'White to move. The king, queen and a rook are all within one knight’s reach.',
        fen: 'r2q1r2/pb4kp/1p4p1/2p1p3/5N2/2P5/PP2QPPP/R4RK1 w - - 0 1',
        line: ['f4e6', 'g7g8', 'e6d8'],
        hint: 'One knight jump hits g7, d8 and f8.',
        success: 'Ne6+ forks king, queen and rook (a “family fork”). The king must move, and Nxd8 takes the queen.',
      },
    ],
  },
  {
    id: 'fork-setups',
    group: 'Tactics',
    title: 'Setting up forks',
    icon: '🪤',
    summary: 'Decoys, checks and removing the guard to create forks.',
    rule: 'Find the fork square first, then work backwards: what stops you using it, and how can you force the enemy pieces onto it?',
    spot: [
      'A fork square that is guarded once: can you capture or chase away the guard?',
      'A fork that would work if the enemy king or queen stood one square over: can a check or sacrifice put it there?',
      'An enemy piece that must recapture: where will it land?',
    ],
    themes: ['setup', 'sacrifice'],
    steps: [
      {
        kind: 'info',
        title: 'Forks have to be prepared',
        text: 'Strong players don’t wait for forks to appear: they make them. There are three standard ways. Decoy: sacrifice to lure a piece onto the fork square. Drive: give a check that forces the king onto it. Remove the guard: capture the piece that protects the fork square. Here the knight would love to land on f7 and hit both h8 and d8, but the black queen is on e7, not d8.',
        fen: '7k/p3q1pp/1p6/6N1/8/P7/5PPP/3R2K1 w - - 0 1',
        arrows: ['g5f7', 'b:f7h8', 'b:f7d8'],
        marks: ['f7'],
      },
      {
        kind: 'walk',
        title: 'Decoy the king with a sacrifice',
        text: 'Black’s queen on c6 is attacking the bishop. White uses it to set up a knight fork. Press Next to play through it.',
        fen: 'rnb1kbnr/ppp2ppp/2q5/8/2B5/5N2/PPP2PPP/RNBQ1RK1 w kq - 0 1',
        moves: [
          {
            uci: 'c4f7',
            text: 'Bxf7+! The bishop gives itself up to drag the king onto f7, a knight’s jump from e5.',
          },
          {
            uci: 'e8f7',
            text: 'Kxf7. Declining with ...Ke7 avoids the fork, but then Black is a pawn down with the king stuck in the centre.',
          },
          {
            uci: 'f3e5',
            text: 'Ne5+ lands on the fork square: it checks the king and attacks the queen on c6.',
            arrows: ['r:e5f7', 'r:e5c6'],
          },
          { uci: 'f7f6', text: 'The king has to move.' },
          {
            uci: 'e5c6',
            text: 'Nxc6 wins the queen. White gave a bishop and will lose the knight, but got a queen and a pawn for them.',
          },
        ],
      },
      {
        kind: 'puzzle',
        title: 'Decoy the queen',
        text: 'White to move. Get the black queen onto d8, a knight’s jump from f7.',
        fen: '7k/p3q1pp/1p6/6N1/8/P7/5PPP/3R2K1 w - - 0 1',
        line: ['d1d8', 'e7d8', 'g5f7', 'h8g8', 'f7d8'],
        hint: 'Sacrifice your rook with check on the square where you want the queen.',
        success:
          'Rd8+! leaves Black no choice: blocking on e8 or f8 loses to mate on the back rank, so the queen takes. Then Nf7+ forks king and queen.',
      },
      {
        kind: 'puzzle',
        title: 'Remove the guard',
        text: 'White to move. The knight wants e7, where it would hit g8, c8 and f5. What is guarding e7?',
        fen: 'r1q2rk1/pp3ppp/2n5/1B1N1b2/8/8/PPP2PPP/R2Q1RK1 w - - 0 1',
        line: ['b5c6', 'g8h8', 'd5e7'],
        hint: 'The knight on c6 covers e7. Take it.',
        success:
          'Bxc6 removes the guard of e7. If Black recaptures, Ne7+ forks king and queen. Black avoided that with ...Kh8, but Ne7 still forks the queen and the bishop, and White is a piece up.',
      },
    ],
  },
  {
    id: 'pins',
    group: 'Tactics',
    title: 'Pins',
    icon: '📌',
    summary: 'Freeze a piece in front of a bigger one, then attack it.',
    rule: 'A pinned piece is a weak piece: attack it again, and don’t trust it to defend anything.',
    spot: [
      'An enemy king or queen on the same line as one of its own pieces, with your bishop, rook or queen able to reach that line.',
      'An enemy piece that is pinned: can you attack it with a pawn?',
      'Something “defended” only by a pinned piece: it is really undefended.',
    ],
    themes: ['pin'],
    steps: [
      {
        kind: 'info',
        title: 'Absolute pin',
        text: 'A pin attacks a piece that can’t move without exposing a more valuable piece behind it. When the piece behind is the king, the pinned piece is not allowed to move at all. This is an absolute pin.',
        fen: '4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1',
        arrows: ['r:b5e8'],
        marks: ['c6'],
      },
      {
        kind: 'info',
        title: 'Relative pin',
        text: 'When the piece behind is the queen or a rook, the pinned piece may move, but that costs material. Only bishops, rooks and queens can pin, because only they attack along lines.',
        fen: '3qk3/8/5n2/6B1/8/8/8/4K3 w - - 0 1',
        arrows: ['r:g5d8'],
        marks: ['f6'],
      },
      {
        kind: 'info',
        title: 'How to win a pinned piece',
        text: 'A pinned piece can’t run away, so attack it again, ideally with a pawn. Here the knight is pinned to the king and the pawn attacks it: the knight is lost. Two more ideas: a pinned piece doesn’t really defend anything, and a check or a trade can line up the king and queen for a pin.',
        fen: '4k3/8/2n5/1B1P4/8/8/8/4K3 b - - 0 1',
        arrows: ['r:b5e8', 'r:d5c6'],
      },
      {
        kind: 'puzzle',
        title: 'Pin the queen',
        text: 'White to move. Black’s queen and king are on the same file.',
        fen: 'rnb1kb1r/ppp2ppp/8/4q3/8/8/PPP2PPP/RNBQ1RK1 w kq - 0 1',
        line: ['f1e1', 'e5e6', 'e1e6'],
        hint: 'Put a rook on the e-file.',
        success: 'Re1 pins the queen to the king. It can only move along the e-file, and wherever it goes, White wins it for a rook.',
      },
      {
        kind: 'puzzle',
        title: 'Pin and win',
        text: 'White to move. The knight on c6 is pinned to the king.',
        fen: 'r1bqkbnr/1pp2ppp/2n5/pB2p3/3PP3/8/PPP2PPP/RNBQK1NR w KQkq - 0 1',
        line: ['d4d5'],
        hint: 'Attack the pinned piece with a pawn.',
        success: 'd5 attacks the pinned knight, which can’t move. Black will lose a piece.',
      },
      {
        kind: 'puzzle',
        title: 'The fake defender',
        text: 'White to move. Black’s bishop on h6 attacks your queen. Is it really defended?',
        fen: 'r2q1r1k/ppp2ppp/2n4b/8/8/1P6/PBPQNPPP/R4RK1 w - - 0 1',
        line: ['d2h6'],
        hint: 'Look at the g7 pawn and the long diagonal.',
        success: 'Qxh6! The g7 pawn can’t recapture, because it is pinned to the king by the bishop on b2. White also threatens Qxg7#.',
      },
    ],
  },
  {
    id: 'skewers',
    group: 'Tactics',
    title: 'Skewers',
    icon: '🍢',
    summary: 'Attack the big piece; when it moves, take the one behind.',
    rule: 'When two enemy pieces share a line with the more valuable one in front, attack the front one, ideally with check.',
    spot: [
      'King and rook, or king and queen, on the same rank, file or diagonal.',
      'Endgames with an exposed king: checks along a line often skewer.',
      'A queen in front of an undefended rook.',
    ],
    themes: ['skewer'],
    steps: [
      {
        kind: 'info',
        title: 'A pin in reverse',
        text: 'In a skewer the more valuable piece is in front. You attack it, it has to move, and you take the piece behind. Here Ra8+ forces the king off the back rank, and then Rxh8 wins the rook.',
        fen: 'R3k2r/8/8/8/8/8/8/4K3 b - - 0 1',
        arrows: ['r:a8e8', 'b:e8h8'],
      },
      {
        kind: 'info',
        title: 'Checks make the best skewers',
        text: 'With a check, the king has no choice but to step off the line. In endgames the kings come out, and checks along files and diagonals often skewer them against a queen or rook. Here Qd1+ skewers the king and the rook on d8.',
        fen: '3r4/8/8/3k4/8/8/8/3QK3 b - - 0 1',
        arrows: ['r:d1d5', 'b:d5d8'],
      },
      {
        kind: 'puzzle',
        title: 'Bishop skewer',
        text: 'White to move. The black king and rook are on the same long diagonal.',
        fen: 'r7/4n3/p5p1/1p1k3p/1P5P/P5P1/5P2/2RB2K1 w - - 0 1',
        line: ['d1f3', 'd5e5', 'f3a8'],
        hint: 'Give a check on the h1-a8 diagonal.',
        success: 'Bf3+ checks the king, and once it steps off the diagonal, Bxa8 wins the rook.',
      },
      {
        kind: 'puzzle',
        title: 'Rook skewer',
        text: 'White to move. King and queen on the f-file.',
        fen: 'R7/8/5k2/8/6PP/7K/5q2/8 w - - 0 1',
        line: ['a8f8', 'f6e5', 'f8f2'],
        hint: 'Check along the file.',
        success: 'Rf8+ skewers the king to the queen. The king moves and Rxf2 wins the queen.',
      },
      {
        kind: 'puzzle',
        title: 'Queen in front',
        text: 'White to move. The black queen and the rook on h8 are on the same diagonal.',
        fen: '1k1r3r/ppp2p1p/4b1p1/4q3/8/5Q2/PPPB1PPP/R4RK1 w - - 0 1',
        line: ['d2c3', 'e5c5', 'c3h8'],
        hint: 'Attack the queen with a protected bishop.',
        success: 'Bc3 attacks the queen, protected by the b2 pawn so ...Qxc3 loses the queen. When the queen moves, Bxh8 wins the rook.',
      },
    ],
  },
  {
    id: 'discovered',
    group: 'Tactics',
    title: 'Discovered attacks',
    icon: '💥',
    summary: 'Move one piece to unleash another, including double check.',
    rule: 'When one of your pieces stands between your rook, bishop or queen and an enemy target, moving it creates two threats at once.',
    spot: [
      'Your piece blocking your own line towards the enemy king or queen.',
      'A move with that blocking piece that also attacks or captures something.',
      'Discovered check: the moving piece can go anywhere, even onto an attacked square.',
    ],
    themes: ['discovered', 'doubleCheck'],
    steps: [
      {
        kind: 'info',
        title: 'Unleash the piece behind',
        text: 'A discovered attack happens when you move a piece out of the way and uncover an attack by the piece behind it. You get two threats from one move: the uncovered attack, and whatever the moving piece does. Here, any knight move uncovers a check from the rook.',
        fen: '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1',
        arrows: ['b:e1e8'],
        marks: ['e4'],
      },
      {
        kind: 'info',
        title: 'Discovered check and double check',
        text: 'If the uncovered piece gives check, the moving piece is free to grab anything, because the opponent must deal with the check first. If both pieces give check, it is a double check. You can’t block two checks or capture two pieces at once, so the only defence is a king move, and it is often mate.',
        fen: '4k3/8/3N4/8/8/8/8/4R1K1 b - - 0 1',
        arrows: ['r:d6e8', 'r:e1e8'],
      },
      {
        kind: 'puzzle',
        title: 'Discovered attack on the queen',
        text: 'White to move. Your bishop stands between your queen and Black’s queen.',
        fen: 'r1bqnrk1/pp3ppp/2p5/8/8/3B4/PPP2PPP/RN1Q1RK1 w - - 0 1',
        line: ['d3h7', 'g8h7', 'd1d8'],
        hint: 'Move the bishop with check.',
        success: 'Bxh7+! uncovers the queen’s attack on d8. Black must answer the check, so Qxd8 wins the queen.',
      },
      {
        kind: 'puzzle',
        title: 'Discovered check',
        text: 'White to move. Your knight blocks your rook’s line to the black king.',
        fen: 'r1b1kbnr/ppp2ppp/2q5/4N3/8/8/PPP2PPP/R2QR1K1 w kq - 0 1',
        line: ['e5c6'],
        hint: 'The knight can take anything it likes: the rook gives check.',
        success: 'Nxc6+ takes the queen with a discovered check from the rook. Black has to deal with the check, so White keeps the queen.',
      },
      {
        kind: 'puzzle',
        title: 'Double check',
        text: 'White to move and mate in one.',
        fen: 'rnbqkbnr/pppp1ppp/8/8/2B1N3/5N2/PPPP1PPP/R1BQR1K1 w kq - 0 1',
        line: ['e4d6'],
        anyMate: true,
        hint: 'Move the knight so that it gives check too.',
        success:
          'Nd6# is a double check from the knight and the rook. Taking the knight doesn’t stop the rook’s check, and the king has no square: checkmate.',
      },
    ],
  },
  {
    id: 'remove-defender',
    group: 'Tactics',
    title: 'Removing the defender',
    icon: '🛡️',
    summary: 'Capture or chase away the piece that holds everything together.',
    rule: 'Count the defenders. If a piece or a key square is guarded only once, capture that guard.',
    spot: [
      'An enemy piece defended exactly once.',
      'A mating square (like h7 or g7) held by a single knight or bishop.',
      'Exchanges that remove a key defender, even at a small cost.',
    ],
    themes: ['removeDefender'],
    steps: [
      {
        kind: 'info',
        title: 'Take the guard',
        text: 'If something is protected only once, capture or chase away its protector, and it falls. Here the bishop on d5 is attacked by the rook and guarded only by the knight on f6. After Bxf6, the bishop on d5 is undefended.',
        fen: '4k3/8/5n2/3b2B1/8/8/8/3R2K1 w - - 0 1',
        arrows: ['g5f6', 'b:f6d5', 'r:d1d5'],
      },
      {
        kind: 'puzzle',
        title: 'The guard of h7',
        text: 'White to move. Your queen and bishop aim at h7, but the knight on f6 guards it.',
        fen: 'rnbq1rk1/pp2bppp/2p1pn2/3p2B1/3P4/2PQ1N2/PPB2PPP/RN3RK1 w - - 0 1',
        line: ['g5f6'],
        hint: 'Get rid of the knight.',
        success: 'Bxf6 removes the only defender of h7. After ...Bxf6 or ...gxf6, Qxh7 is mate, so Black has to give up a piece with ...g6.',
      },
      {
        kind: 'puzzle',
        title: 'The guard of d5',
        text: 'White to move. The bishop on d5 is guarded only by the knight.',
        fen: 'r4rk1/ppq2ppp/5n2/3b2B1/8/8/PPP1QPPP/1N1R1RK1 w - - 0 1',
        line: ['g5f6'],
        hint: 'Capture the defender.',
        success: 'Bxf6 takes the knight that guarded d5. If ...gxf6, Rxd5 picks up the bishop. Either way White wins a piece.',
      },
    ],
  },
  {
    id: 'overloading',
    group: 'Tactics',
    title: 'Overloading',
    icon: '🏋️',
    summary: 'A defender with two jobs can only do one of them.',
    rule: 'When one enemy piece guards two things, attack one of them: the other falls.',
    spot: [
      'One piece guarding both another piece and the back rank.',
      'A defender that must recapture somewhere else.',
      'Captures that can’t be answered because the recapture would allow mate.',
    ],
    themes: ['sacrifice', 'backRankMate'],
    steps: [
      {
        kind: 'info',
        title: 'Two jobs, one piece',
        text: 'An overloaded piece is defending two things at once. Make it do one job and the other one fails. Here the rook on b8 guards both the queen on b7 and the back rank.',
        fen: '1r4k1/1q3ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
        arrows: ['b:b8b7', 'b:b8d8'],
        marks: ['b8'],
      },
      {
        kind: 'puzzle',
        title: 'The overloaded rook',
        text: 'White to move. The rook on b8 has two jobs.',
        fen: '1r4k1/pq3ppp/8/8/4Q3/7P/PP3PP1/3R2K1 w - - 0 1',
        line: ['e4b7'],
        alts: ['d1d8'],
        hint: 'What happens if the rook takes back on b7?',
        success: 'Qxb7! wins the queen: ...Rxb7 would be met by Rd8#, because the rook can’t guard b7 and the back rank at the same time.',
      },
    ],
  },
  {
    id: 'back-rank',
    group: 'Checkmate patterns',
    title: 'Back-rank mate',
    icon: '🧱',
    summary: 'Mate on the first or last rank against a king trapped by its own pawns.',
    rule: 'If the enemy king has no escape square, check the back rank. Make an escape square (“luft”) for your own king.',
    spot: [
      'A castled king with all three pawns unmoved.',
      'Only one enemy piece guarding the back rank: deflect it.',
      'Your own back rank: is it weak? Play h3 or g3 when you have time.',
    ],
    themes: ['backRankMate'],
    steps: [
      {
        kind: 'info',
        title: 'Trapped by its own pawns',
        text: 'The king’s own pawns take away its escape squares. A rook or queen on the back rank gives mate.',
        fen: '3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1',
        arrows: ['r:d8g8'],
      },
      {
        kind: 'info',
        title: 'Luft',
        text: 'Defend by giving your king an escape square with a pawn move such as h3 or h6, and keep a rook or queen guarding the back rank. When attacking, look for the one piece that guards the back rank: deflect it or overload it, and the mate goes through.',
        fen: '6k1/5pp1/7p/8/8/7P/5PP1/6K1 w - - 0 1',
        marks: ['h7', 'h2'],
      },
      {
        kind: 'puzzle',
        title: 'Back-rank mate',
        text: 'White to move and mate in one.',
        fen: '6k1/5ppp/8/8/8/8/q4PPP/3R2K1 w - - 0 1',
        line: ['d1d8'],
        anyMate: true,
        hint: 'The back rank is empty.',
        success: 'Rd8# - the pawns on f7, g7 and h7 cage the king.',
      },
      {
        kind: 'puzzle',
        title: 'Remove the guard of the back rank',
        text: 'White to move and mate in two.',
        fen: 'r3r1k1/ppp2ppp/1q6/8/8/8/PP2QPPP/4R1K1 w - - 0 1',
        line: ['e2e8', 'a8e8', 'e1e8'],
        anyMate: true,
        hint: 'Sacrifice the queen to deflect the rook from the back rank.',
        success: 'Qxe8+! Rxe8 drags the last defender onto e8, and Rxe8 is mate.',
      },
    ],
  },
  {
    id: 'smothered',
    group: 'Checkmate patterns',
    title: 'Smothered mate',
    icon: '🐴',
    summary: 'A knight mates a king boxed in by its own pieces.',
    rule: 'A king in the corner with its pieces around it is vulnerable to a knight check on f7 (or f2).',
    spot: [
      'King on h8 (or h1) with pawns on g7 and h7 and a piece on g8.',
      'Your knight one jump from f7, and your queen on the a2-g8 diagonal.',
      'A queen sacrifice on g8 that forces the rook to block the king’s last square.',
    ],
    themes: ['smotheredMate'],
    steps: [
      {
        kind: 'info',
        title: 'No squares left',
        text: 'In a smothered mate the king is surrounded by its own pieces, and a knight check is mate. Here g8 is blocked by the rook, and g7 and h7 by pawns.',
        fen: '6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1',
        arrows: ['r:f7h8'],
      },
      {
        kind: 'puzzle',
        title: 'Smothered mate',
        text: 'White to move and mate in one.',
        fen: '6rk/6pp/8/6N1/8/8/5PPP/6K1 w - - 0 1',
        line: ['g5f7'],
        anyMate: true,
        hint: 'Where does the knight check the king?',
        success: 'Nf7#. The king is boxed in by its own rook and pawns.',
      },
      {
        kind: 'puzzle',
        title: 'Sacrifice, then smother',
        text: 'White to move and mate in two.',
        fen: 'r1b2r1k/pp4pp/1qp4N/4p3/2Q5/8/PP3PPP/R1B3K1 w - - 0 1',
        line: ['c4g8', 'f8g8', 'h6f7'],
        anyMate: true,
        hint: 'Force the rook onto g8.',
        success: 'Qg8+! The king can’t take because the knight guards g8, so ...Rxg8 is forced, blocking the last square. Nf7# is a smothered mate.',
      },
      {
        kind: 'walk',
        title: 'Philidor’s legacy',
        text: 'The classic smothered-mate combination, mate in four. Press Next to play through it.',
        fen: '4r2k/ppp3pp/3q4/4N3/2Q5/8/PPP3PP/5RK1 w - - 0 1',
        moves: [
          { uci: 'e5f7', text: 'Nf7+ - the king has only one square.' },
          { uci: 'h8g8', text: 'Kg8.' },
          {
            uci: 'f7h6',
            text: 'Nh6+ is a double check from the knight and the queen. The rook on f1 covers f8, so the king must go back to h8.',
            arrows: ['r:h6g8', 'r:c4g8'],
          },
          { uci: 'g8h8', text: 'Kh8.' },
          { uci: 'c4g8', text: 'Qg8+!! The knight guards g8, so the king can’t take.' },
          { uci: 'e8g8', text: 'Rxg8 is forced, and now the rook blocks the king’s last square.' },
          { uci: 'h6f7', text: 'Nf7# - smothered mate.' },
        ],
      },
    ],
  },
  {
    id: 'loose-pieces',
    group: 'Tactics',
    title: 'Loose pieces',
    icon: '🎯',
    summary: 'Undefended pieces drop off. Count attackers and defenders.',
    rule: 'Before every move, ask: which of my pieces and which of theirs are undefended?',
    spot: [
      'Any piece with no defender at all: it’s a target for every double attack.',
      'A piece attacked more times than it is defended.',
      'A defender that is worth more than the attacker: then even one attack wins.',
    ],
    themes: ['hanging'],
    steps: [
      {
        kind: 'info',
        title: 'Loose pieces drop off',
        text: 'Most material in club games is lost to pieces with no defender. A loose piece can be won by any double attack: a fork, a check that also hits it, or a discovered attack. Here the bishop on h4 is loose, so Qa4+ would win it. Make it a habit to spot loose pieces, your own included.',
        fen: '4k3/8/8/8/7b/8/8/2KQ4 w - - 0 1',
        arrows: ['d1a4', 'y:a4e8', 'y:a4h4'],
        marks: ['h4'],
      },
      {
        kind: 'info',
        title: 'Count before you capture',
        text: 'Count attackers and defenders, and their values. The knight on e5 is attacked by the knight and the rook and defended by the d6 pawn. Nxe5 dxe5 is only a trade, and Rxe5 dxe5 loses the rook. If something is attacked more times than it is defended, or attacked by a cheaper piece, it can be won.',
        fen: '4k3/8/3p4/4n3/8/5N2/8/4R1K1 w - - 0 1',
        arrows: ['f3e5', 'e1e5', 'b:d6e5'],
      },
      {
        kind: 'puzzle',
        title: 'The loose rook',
        text: 'White to move. One of Black’s pieces has no defender. Find it and take it.',
        fen: '6k1/5ppp/8/r7/7q/8/PP1Q1PPP/6K1 w - - 0 1',
        line: ['d2a5'],
        hint: 'Look along the queen’s diagonals.',
        success: 'Qxa5 wins a whole rook: nothing defends it. Scan the board for undefended pieces every move, theirs and yours.',
      },
    ],
  },
  {
    id: 'opening-principles',
    group: 'Openings',
    title: 'Opening principles',
    icon: '🏁',
    summary: 'Centre, development, king safety, and not wasting time.',
    rule: 'Fight for the centre, develop a new piece with each move, and castle early.',
    spot: [
      'Count your developed pieces against your opponent’s.',
      'Moving the queen early, or the same piece twice, usually loses time.',
      'Castle before you start an attack, and before you open the centre.',
    ],
    themes: [],
    steps: [
      {
        kind: 'info',
        title: 'Four goals',
        text: 'In the opening: 1) Control the centre (e4, d4, e5, d5) with pawns and pieces. 2) Develop your knights and bishops quickly, usually knights first. 3) Castle early, so your king is safe and a rook comes towards the centre. 4) Don’t waste moves: avoid early queen trips, moving the same piece twice, and pawn moves on the edge.',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
        marks: ['d4', 'e4', 'd5', 'e5'],
      },
      {
        kind: 'quiz',
        title: 'Your second move',
        text: 'After 1.e4 e5, which move follows the opening principles best?',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        options: [
          { label: 'Nf3', uci: 'g1f3', correct: true, why: 'It develops a piece towards the centre and attacks e5 at the same time.' },
          {
            label: 'Qh5',
            uci: 'd1h5',
            why: 'An early queen trip. It attacks e5 and f7, but after ...Nc6, ...g6 and ...Nf6 the queen gets chased around and White loses time.',
          },
          { label: 'h4', uci: 'h2h4', why: 'A pawn move on the edge does nothing for the centre or for development.' },
        ],
      },
      {
        kind: 'quiz',
        title: 'Meet the early queen',
        text: 'White threatens Qxf7#. What is the best way to stop it?',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
        options: [
          {
            label: '...g6',
            uci: 'g7g6',
            correct: true,
            why: 'It blocks the queen’s path to f7 and attacks the queen, so Black gains time. The bishop can follow to g7.',
          },
          {
            label: '...Nf6',
            uci: 'g8f6',
            why: 'It develops a piece, but loses at once to Qxf7#. Check your opponent’s threats before developing.',
            arrows: ['r:h5f7'],
          },
          {
            label: '...Qe7',
            uci: 'd8e7',
            correct: true,
            why: 'That defends f7 too, but the queen blocks the f8 bishop. ...g6 is more useful because it gains time against the queen.',
          },
        ],
      },
      {
        kind: 'quiz',
        title: 'Time to castle',
        text: 'Both sides have developed. What is White’s most useful move?',
        fen: 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R w KQkq - 0 6',
        options: [
          { label: 'O-O', uci: 'e1g1', correct: true, why: 'King safety first, and the rook moves towards the centre where it will be useful.' },
          {
            label: 'Ng5',
            uci: 'f3g5',
            why: 'It moves an already developed piece again to attack f7. After ...O-O it has no follow-up and has to go back.',
          },
          { label: 'Kf1', uci: 'e1f1', why: 'Walking the king gives up castling, and the rook on h1 stays stuck.' },
        ],
      },
      {
        kind: 'info',
        title: 'What your reviews look for',
        text: 'Your game reviews point out the classic opening mistakes: bringing the queen out early, moving the same piece twice, pushing pawns on the edge, and leaving the king in the centre. The “Lessons from this game” section shows which ones you make most often.',
        fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
        marks: ['f3'],
      },
    ],
  },
  {
    id: 'queen-mate',
    group: 'Endgames',
    title: 'Mate with the queen',
    icon: '👑',
    summary: 'King and queen against a lone king.',
    rule: 'Box the king in with the queen a knight’s move away, bring your king up, and watch out for stalemate.',
    spot: [
      'Don’t give random checks: shrink the box instead.',
      'When the king is on the edge, bring your own king to help.',
      'Always leave the enemy king a move until the mating move.',
    ],
    themes: [],
    steps: [
      {
        kind: 'info',
        title: 'The method',
        text: 'Put your queen a knight’s move away from the enemy king to box it in. Each time it steps back, follow it and make the box smaller, until the king is on the edge. Then bring your own king up and mate with the queen next to the king, protected by your king. Careful: if the enemy king has no moves and isn’t in check, it’s stalemate, which is a draw.',
        fen: '8/8/8/4k3/8/8/Q7/4K3 w - - 0 1',
      },
      {
        kind: 'drill',
        title: 'Your turn',
        text: 'Checkmate Stockfish’s king within 25 moves.',
        fen: '8/8/8/4k3/8/8/Q7/4K3 w - - 0 1',
        goal: 'mate',
        maxMoves: 25,
        success: 'Checkmate! You can now win every king-and-queen ending.',
      },
    ],
  },
  {
    id: 'rook-mate',
    group: 'Endgames',
    title: 'Mate with the rook',
    icon: '🏰',
    summary: 'King and rook against a lone king.',
    rule: 'Cut the king off with the rook, use your king to take the opposition, then check.',
    spot: [
      'The rook cuts the board; the king pushes.',
      'Check when the kings face each other.',
      'If the king attacks your rook, move it to the far side.',
    ],
    themes: [],
    steps: [
      {
        kind: 'info',
        title: 'The method',
        text: 'Use the rook as a wall that cuts the king off. Walk your king towards the enemy king. When the kings face each other with one square between them, check with the rook to push the king back one row. If the king steps aside instead, make a waiting move with the rook along its row. Repeat until the king is on the edge, then mate.',
        fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
      },
      {
        kind: 'drill',
        title: 'Your turn',
        text: 'Checkmate Stockfish’s king within 40 moves.',
        fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
        goal: 'mate',
        maxMoves: 40,
        success: 'Checkmate! The rook mate is the most important basic ending.',
      },
    ],
  },
  {
    id: 'opposition',
    group: 'Endgames',
    title: 'King and pawn: the opposition',
    icon: '♙',
    summary: 'Win the most common ending by getting your king in front.',
    rule: 'Get your king in front of your pawn, and take the opposition.',
    spot: [
      'Lead with the king, not the pawn.',
      'Kings facing each other with one square between: the side not to move has the opposition.',
      'A king on the 6th rank in front of its pawn always wins.',
    ],
    themes: [],
    steps: [
      {
        kind: 'info',
        title: 'The opposition',
        text: 'When the kings stand face to face with one square between them, the side that does NOT have to move holds the opposition: the other king must give way. With king and pawn against king, march your king in front of the pawn first, take the opposition, and only then push the pawn.',
        fen: '8/8/4k3/8/4K3/8/4P3/8 b - - 0 1',
        marks: ['e5'],
      },
      {
        kind: 'drill',
        title: 'Your turn',
        text: 'Promote your pawn safely against Stockfish. Lead with your king.',
        fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1',
        goal: 'promote',
        maxMoves: 30,
        success: 'You promoted the pawn. King in front, opposition, then push: that wins.',
      },
    ],
  },
];

export const LESSONS: Lesson[] = [...BASE_LESSONS, ...EXTRA_LESSONS];

export const LESSON_GROUPS: Lesson['group'][] = ['Basics', 'Tactics', 'Checkmate patterns', 'Openings', 'Endgames'];

export const findLesson = (id: string) => LESSONS.find((l) => l.id === id);

/** The lesson that teaches a game-review theme (see src/lib/review/lessons.ts). */
export const LESSON_FOR_THEME: Record<string, string> = {
  fork: 'forks',
  pin: 'pins',
  skewer: 'skewers',
  discovered: 'discovered',
  hanging: 'defend',
  backRank: 'back-rank',
  missedMate: 'mating-nets',
  exchanges: 'values',
  missedChance: 'loose-pieces',
  missedRecapture: 'cct',
  earlyQueen: 'opening-principles',
  samePieceTwice: 'opening-principles',
  development: 'opening-principles',
  flankPawns: 'opening-principles',
  kingSafety: 'opening-principles',
  fPawn: 'opening-principles',
  endgameKing: 'opposition',
  passedPawn: 'promotion',
};
