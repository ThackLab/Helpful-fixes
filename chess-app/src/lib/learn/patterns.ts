// The pattern card that opens each tactics lesson (what it is, what to look
// for, how to make it happen, how to stop it), and the spot-it drills played
// after the lesson's explanations: tap the fork square, the pinned piece...
import type { Lesson, PatternStep, TapStep } from './curriculum';

const PATTERNS: Record<string, PatternStep> = {
  'loose-pieces': {
    kind: 'pattern',
    title: 'Loose pieces',
    fen: '4k3/8/8/8/7b/8/8/2KQ4 w - - 0 1',
    arrows: ['d1a4', 'y:a4e8', 'y:a4h4'],
    what: 'A loose piece is one nothing defends. It can be taken for free, and it is the usual target of forks and double attacks.',
    cue: 'Go round the board: which pieces, theirs and yours, have no defender? Pieces on the edge and pieces that just moved are often loose.',
    setup: 'Attack two loose pieces at once, or give a check that also hits one. Here Qa4+ checks the king and takes the bishop next.',
    defend: 'Before every move, ask which of your pieces will be undefended after it. Keep pieces protecting each other.',
  },
  'back-rank': {
    kind: 'pattern',
    title: 'Back-rank mate',
    fen: '3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1',
    arrows: ['r:d8g8'],
    what: 'A rook or queen checks the king along its back rank, and the king’s own pawns stop it stepping forward.',
    cue: 'A castled king with its three pawns unmoved, and only one piece (or none) guarding the back rank.',
    setup: 'Get a rook or queen onto an open file, then remove or distract whatever guards the back rank, and check.',
    defend: 'Make an escape square (“luft”) with h3 or g3 when you have a quiet moment, and keep a rook watching your back rank.',
  },
  forks: {
    kind: 'pattern',
    title: 'Forks',
    fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1',
    arrows: ['r:c7e8', 'r:c7a8'],
    what: 'One piece attacks two enemy pieces at once. Your opponent can save only one of them.',
    cue: 'Two valuable pieces (king, queen, rooks) a knight’s jump from the same square, a queen check that also hits a loose piece, two pieces side by side in front of a pawn.',
    setup: 'Find the fork square first. If it is guarded, remove the guard; if a target is not quite in place, check or sacrifice to drive it there.',
    defend: 'Keep your king and queen off squares a knight’s jump apart, and before each move look at where their knights can land.',
  },
  'fork-setups': {
    kind: 'pattern',
    title: 'Setting up forks',
    fen: '7k/p3q1pp/1p6/6N1/8/P7/5PPP/3R2K1 w - - 0 1',
    arrows: ['g5f7', 'b:f7h8', 'b:f7d8'],
    what: 'Most forks don’t exist yet. One forcing move creates them: a decoy that drags a piece onto the fork square, or a capture that removes its guard.',
    cue: 'A fork square that is guarded only once, or a king and queen one move away from standing a knight’s jump apart.',
    setup: 'Work backwards: picture the fork, find what stops it, then find the check, capture or sacrifice that clears it away.',
    defend: 'When they check or sacrifice, look at the square your piece is forced onto. Is it a fork square?',
  },
  pins: {
    kind: 'pattern',
    title: 'Pins',
    fen: '4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1',
    arrows: ['r:b5e8'],
    what: 'A piece can’t move because a bigger piece stands behind it on the same line. Pinned to the king it can’t move at all; pinned to the queen it moves at a cost.',
    cue: 'An enemy piece between your bishop, rook or queen and their king or queen. Knights on c6 and f6 are pinned all the time.',
    setup: 'Pin it, then attack it again, best of all with a pawn. Don’t hurry to take it: a pinned piece isn’t going anywhere.',
    defend: 'Break the pin before it costs you: move the king or queen off the line, put a defender in between, or chase the pinning piece.',
  },
  skewers: {
    kind: 'pattern',
    title: 'Skewers',
    fen: 'R3k2r/8/8/8/8/8/8/4K3 b - - 0 1',
    arrows: ['r:a8e8', 'b:e8h8'],
    what: 'A pin in reverse: you attack the more valuable piece, it gets out of the way, and you take the piece behind it.',
    cue: 'Two enemy pieces on one line with the more valuable one in front, very often a king and a rook in the endgame.',
    setup: 'Attack along the line, with check if you can: a king in check has to move and can’t defend what is behind it.',
    defend: 'Don’t line up your king with your rook or queen on an open line, and keep the piece behind protected.',
  },
  discovered: {
    kind: 'pattern',
    title: 'Discovered attacks',
    fen: '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1',
    arrows: ['b:e1e8'],
    what: 'Moving one piece uncovers an attack by the piece behind it, so one move makes two threats. If the uncovered piece gives check, it is a discovered check.',
    cue: 'One of your pieces standing between your rook, bishop or queen and an enemy king, queen or loose piece.',
    setup: 'Move the front piece with a threat of its own: a check, a capture, an attack on the queen. They can only answer one threat.',
    defend: 'Follow the lines of their rooks, bishops and queen through their own pieces, and get your king and queen off those lines.',
  },
  'remove-defender': {
    kind: 'pattern',
    title: 'Removing the defender',
    fen: '4k3/8/5n2/3b2B1/8/8/8/3R2K1 w - - 0 1',
    arrows: ['g5f6', 'b:f6d5', 'r:d1d5'],
    what: 'If one piece holds something together, capture it or chase it away, and then take what it was guarding.',
    cue: 'Count attackers and defenders. A target guarded once, by a piece you can take or attack, is a target that will fall.',
    setup: 'Capture the guard, even if it costs you material, or attack it with a pawn so it has to move. Then take the target.',
    defend: 'Don’t trust one defender with an important piece or square: give it a second guard.',
  },
  overloading: {
    kind: 'pattern',
    title: 'Overloading',
    fen: '1r4k1/1q3ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    arrows: ['b:b8b7', 'b:b8d8'],
    what: 'One defender has two jobs. Make it do one of them and the other is left undone.',
    cue: 'Draw the lines from each defender. A piece guarding two things at once (two pieces, or a piece and a mate square) is overloaded.',
    setup: 'Capture or attack one of the things it guards. When it takes back or moves, the other one falls.',
    defend: 'Give each important job its own defender, and notice when a trade leaves one piece guarding two things.',
  },
  deflection: {
    kind: 'pattern',
    title: 'Deflection',
    fen: '5rk1/pp2q1pp/8/n7/6Q1/7P/PB3PP1/3R2K1 w - - 0 1',
    arrows: ['y:g4g7', 'b2g7', 'b:e7g7'],
    what: 'Lure a defender away from the square it guards: attack it, give it something to capture, or give a check it has to answer.',
    cue: 'One piece holding a key square, often a mate square, where two of your pieces are aiming.',
    setup: 'Find its job, then give it a more urgent one: a sacrifice it must take, a check, or an attack it must meet.',
    defend: 'Notice the pieces that hold your position together and give them help before they get dragged away.',
  },
  smothered: {
    kind: 'pattern',
    title: 'Smothered mate',
    fen: '6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1',
    arrows: ['r:f7h8'],
    what: 'A knight checks a king that is surrounded by its own pieces. A knight check can’t be blocked, so it is mate.',
    cue: 'A king in the corner with a rook next to it and pawns in front, and your knight able to reach f7 (or f2).',
    setup:
      'Check with the queen to drive the king into the corner, sacrifice the queen next to it so a piece must fill the last square, then mate with the knight.',
    defend: 'Give your king room to breathe, and be careful with knights near f7 and f2 when your king is in the corner.',
  },
  'mating-nets': {
    kind: 'pattern',
    title: 'Mating nets',
    fen: 'r3r1k1/ppp2p1p/5Pp1/8/8/8/PPPQ2PP/5RK1 w - - 0 1',
    arrows: ['y:f6g7', 'd2h6'],
    what: 'Quiet moves that take away the king’s squares one at a time. The check that mates comes last.',
    cue: 'An enemy king with only one or two squares, near the edge, with your pieces close by.',
    setup: 'Count the king’s squares and cover them, often with a pawn, a queen move or your own king, before you give check.',
    defend: 'Keep escape squares for your king, and don’t let enemy pawns get close to it.',
  },
  'king-attack': {
    kind: 'pattern',
    title: 'Attacking the king',
    fen: 'r1bq1rk1/pp1n1ppp/2n1p3/2ppP3/1b1P4/2PB1N2/PP3PPP/RNBQK2R w KQ - 0 8',
    arrows: ['d3h7', 'y:f3g5', 'b:d1h5'],
    what: 'When you have more attackers than they have defenders near the king, a sacrifice can tear the pawn cover open.',
    cue: 'Your pieces aimed at the king (a bishop at h7, a knight that can reach g5, a queen heading for h5) and few defenders, especially no knight on f6.',
    setup: 'Bring your pieces first. Sacrifice on the pawn cover (Bxh7+, Nxf7, Rxh2) only when checks and threats follow.',
    defend: 'Keep a knight on f6 (or f3), don’t push the pawns in front of your king without reason, and trade off the attacking pieces.',
  },
  promotion: {
    kind: 'pattern',
    title: 'Passed pawns',
    fen: '8/8/8/5k2/P7/8/8/6K1 w - - 0 1',
    marks: ['a4', 'e4', 'a8', 'e8'],
    what: 'A passed pawn has no enemy pawn in front of it or on the files next to it. Every step forward ties down more of the opponent’s pieces.',
    cue: 'The rule of the square: draw a box from the pawn to the promotion rank. If the enemy king can’t step into it, the pawn queens alone.',
    setup: 'Push it, support it with your king or with a rook behind it, and use pawn breakthroughs to create one.',
    defend: 'Block a passed pawn with a piece (a knight is ideal) and bring your king in front of it early.',
  },
};

const SPOT_IT: Record<string, TapStep[]> = {
  'loose-pieces': [
    {
      kind: 'tap',
      title: 'Find the loose piece',
      text: 'Tap the black piece that nothing defends.',
      fen: '5rk1/5ppp/8/n7/8/8/5PPP/3Q2K1 w - - 0 1',
      answers: ['a5'],
      success:
        'The knight on a5 has no defender: the rook and pawns are all guarded by the king. Every attack on it is a real threat, and a double attack would win it.',
    },
  ],
  'back-rank': [
    {
      kind: 'tap',
      title: 'Find the mate',
      text: 'White to move. Tap the square where the rook gives mate.',
      fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
      answers: ['e8'],
      success: 'Re8#. The king is shut in by its own pawns, and nothing can block or capture the rook.',
      arrows: ['e1e8'],
    },
  ],
  forks: [
    {
      kind: 'tap',
      title: 'Find the fork square',
      text: 'White to move. Tap the square where the knight attacks the king and the rook at the same time.',
      fen: 'r3k3/5ppp/8/1N6/8/8/5PPP/6K1 w - - 0 1',
      answers: ['c7'],
      success: 'Nc7+ checks the king and hits the rook. The king has to move, and Nxa8 wins the rook.',
      arrows: ['b5c7', 'r:c7e8', 'r:c7a8'],
    },
  ],
  pins: [
    {
      kind: 'tap',
      title: 'Find the pinned piece',
      text: 'Tap the black piece that is not allowed to move.',
      fen: 'r1bqkb1r/ppp2ppp/2np1n2/1B2p3/4P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
      answers: ['c6'],
      success: 'The bishop on b5 pins the knight on c6 to the king. Moving it would leave the king in check, so it can’t take anything either.',
      arrows: ['r:b5e8'],
    },
  ],
  skewers: [
    {
      kind: 'tap',
      title: 'Find the skewer',
      text: 'White to move. Tap the square where the bishop checks the king and wins the rook behind it.',
      fen: 'r7/8/8/8/4k3/8/7K/5B2 w - - 0 1',
      answers: ['g2'],
      success: 'Bg2+ checks along the long diagonal. The king has to step off it, and Bxa8 takes the rook.',
      arrows: ['f1g2', 'r:g2a8'],
    },
  ],
  discovered: [
    {
      kind: 'tap',
      title: 'Find the discovered check',
      text: 'The rook on e1 aims at the king through your knight. Tap the square the knight should go to.',
      fen: '4k3/5ppp/8/2q5/4N3/8/5PPP/4R1K1 w - - 0 1',
      answers: ['c5'],
      success: 'Nxc5+! The rook gives check, so Black has no time to take the knight back: you win the queen for nothing.',
      arrows: ['e4c5', 'r:e1e8'],
    },
  ],
  overloading: [
    {
      kind: 'tap',
      title: 'Find the overloaded piece',
      text: 'One black piece has two jobs. Tap it.',
      fen: '2r3k1/5ppp/2n5/8/8/5Q2/5PPP/3R2K1 w - - 0 1',
      answers: ['c8'],
      success: 'The rook on c8 guards both the knight and the back rank. Qxc6! Rxc6 Rd8# – it can’t do both jobs.',
      arrows: ['f3c6', 'b:c8c6', 'r:d1d8'],
    },
  ],
};

/** Puts the pattern card first and the spot-it drills after the lesson’s opening explanations. */
export function withPatterns(lesson: Lesson): Lesson {
  const pattern = PATTERNS[lesson.id];
  const taps = SPOT_IT[lesson.id] ?? [];
  if (!pattern && !taps.length) return lesson;
  const firstTask = lesson.steps.findIndex((s) => s.kind !== 'info');
  const at = firstTask < 0 ? lesson.steps.length : firstTask;
  return { ...lesson, steps: [...(pattern ? [pattern] : []), ...lesson.steps.slice(0, at), ...taps, ...lesson.steps.slice(at)] };
}
