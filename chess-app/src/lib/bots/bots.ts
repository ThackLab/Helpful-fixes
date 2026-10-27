export type BotStyle = 'balanced' | 'aggressive' | 'solid' | 'tricky' | 'positional' | 'machine';

export interface BotProfile {
  id: string;
  name: string;
  elo: number;
  avatar: string;
  /** Avatar background colour. */
  tint: string;
  style: BotStyle;
  tagline: string;
  bio: string;
  /** Preferred first moves as White / replies as Black (UCI), to give bots a repertoire. */
  repertoire?: { white?: string[]; black?: Record<string, string[]> };
}

export const BOTS: BotProfile[] = [
  {
    id: 'pip',
    name: 'Pip',
    elo: 250,
    avatar: '🐣',
    tint: '#f6d365',
    style: 'balanced',
    tagline: 'Just learned how the horsey moves',
    bio: 'Pip tries to keep its pieces safe but misses plenty: free pieces, checks, anything more than a move deep. A good first opponent.',
  },
  {
    id: 'mo',
    name: 'Mo',
    elo: 400,
    avatar: '🐢',
    tint: '#9bd77a',
    style: 'solid',
    tagline: 'Slow and steady (mostly steady)',
    bio: 'Mo likes to push pawns and usually guards what is attacked, but often misses the piece you leave hanging.',
  },
  {
    id: 'lena',
    name: 'Lena',
    elo: 550,
    avatar: '🐰',
    tint: '#ffb4c6',
    style: 'aggressive',
    tagline: 'Loves bringing the queen out early',
    bio: 'Lena attacks with everything she has, which sometimes works and often doesn’t.',
    repertoire: { white: ['e2e4'], black: { e2e4: ['e7e5'], d2d4: ['d7d5'] } },
  },
  {
    id: 'rusty',
    name: 'Rusty',
    elo: 700,
    avatar: '🦊',
    tint: '#ff9f5a',
    style: 'tricky',
    tagline: 'Sets cheap traps',
    bio: 'Rusty knows a few opening traps and will happily take anything you leave undefended.',
    repertoire: { white: ['e2e4'], black: { e2e4: ['e7e5'], d2d4: ['d7d5'] } },
  },
  {
    id: 'bella',
    name: 'Bella',
    elo: 850,
    avatar: '🐼',
    tint: '#d9d9d9',
    style: 'solid',
    tagline: 'Develops, castles, then thinks',
    bio: 'Bella has learned the opening principles but still drops pieces in complicated positions.',
    repertoire: { white: ['d2d4', 'e2e4'], black: { e2e4: ['e7e5', 'c7c6'], d2d4: ['d7d5'] } },
  },
  {
    id: 'hugo',
    name: 'Hugo',
    elo: 1000,
    avatar: '🦉',
    tint: '#b39ddb',
    style: 'positional',
    tagline: 'A thoughtful club beginner',
    bio: 'Hugo plays sensible moves and punishes obvious blunders, but can be out-calculated.',
  },
  {
    id: 'priya',
    name: 'Priya',
    elo: 1150,
    avatar: '🦋',
    tint: '#80deea',
    style: 'tricky',
    tagline: 'Sneaky tactician',
    bio: 'Priya loves forks and pins. Keep an eye on your loose pieces.',
    repertoire: { white: ['e2e4'], black: { e2e4: ['c7c5', 'e7e5'], d2d4: ['g8f6'] } },
  },
  {
    id: 'viktor',
    name: 'Viktor',
    elo: 1300,
    avatar: '🐻',
    tint: '#bcaaa4',
    style: 'solid',
    tagline: 'Hard to break down',
    bio: 'Viktor trades pieces and grinds endgames. He rarely blunders outright.',
    repertoire: { white: ['d2d4'], black: { e2e4: ['c7c6', 'e7e6'], d2d4: ['d7d5'] } },
  },
  {
    id: 'sofia',
    name: 'Sofia',
    elo: 1450,
    avatar: '🐯',
    tint: '#ffcc80',
    style: 'aggressive',
    tagline: 'Attacks your king on sight',
    bio: 'Sofia goes for sharp openings and kingside attacks.',
    repertoire: { white: ['e2e4'], black: { e2e4: ['c7c5'], d2d4: ['g8f6'] } },
  },
  {
    id: 'marcus',
    name: 'Marcus',
    elo: 1600,
    avatar: '🦁',
    tint: '#ffe082',
    style: 'balanced',
    tagline: 'Strong club player',
    bio: 'Marcus has a solid repertoire and good tactical vision.',
  },
  {
    id: 'yuki',
    name: 'Yuki',
    elo: 1800,
    avatar: '🐉',
    tint: '#a5d6a7',
    style: 'positional',
    tagline: 'Squeezes small advantages',
    bio: 'Yuki builds pressure slowly and converts endgames cleanly.',
    repertoire: { white: ['c2c4', 'g1f3', 'd2d4'], black: { e2e4: ['e7e6', 'c7c5'], d2d4: ['g8f6'] } },
  },
  {
    id: 'elena',
    name: 'Elena',
    elo: 2000,
    avatar: '🦅',
    tint: '#90caf9',
    style: 'aggressive',
    tagline: 'Expert-level attacker',
    bio: 'Elena calculates deeply and loves the initiative.',
    repertoire: { white: ['e2e4'], black: { e2e4: ['c7c5'], d2d4: ['g8f6'] } },
  },
  {
    id: 'professor',
    name: 'The Professor',
    elo: 2200,
    avatar: '🎓',
    tint: '#ce93d8',
    style: 'positional',
    tagline: 'Candidate-master technique',
    bio: 'Deep opening knowledge and excellent technique. Mistakes are rare.',
  },
  {
    id: 'ivy',
    name: 'IM Ivy',
    elo: 2450,
    avatar: '🌿',
    tint: '#81c784',
    style: 'balanced',
    tagline: 'International Master strength',
    bio: 'Ivy plays at IM level: precise, practical and dangerous in every phase.',
  },
  {
    id: 'atlas',
    name: 'GM Atlas',
    elo: 2700,
    avatar: '🗿',
    tint: '#b0bec5',
    style: 'positional',
    tagline: 'Super-grandmaster',
    bio: 'Atlas plays like an elite grandmaster. Draws are an achievement.',
  },
  {
    id: 'titan',
    name: 'Titan',
    elo: 2950,
    avatar: '🤖',
    tint: '#78909c',
    style: 'machine',
    tagline: 'Beyond human',
    bio: 'An engine with the brakes slightly on.',
  },
  {
    id: 'stockfish',
    name: 'Stockfish 18',
    elo: 3200,
    avatar: '🐟',
    tint: '#4fc3f7',
    style: 'machine',
    tagline: 'Full strength. Good luck.',
    bio: 'The strongest chess engine in the world, running at full power in your browser.',
  },
];

/** One or two letters standing in for a player in the minimal UI ("Pip" -> "P", "GM Atlas" -> "A", "Stockfish 18" -> "S"). */
export function monogram(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !['The', 'GM', 'IM', 'FM'].includes(w));
  return (words[0] ?? name)[0]?.toUpperCase() ?? '?';
}

export function customBot(elo: number): BotProfile {
  return {
    id: `custom-${elo}`,
    name: `Custom ${elo}`,
    elo,
    avatar: '🎯',
    tint: '#ffab91',
    style: 'balanced',
    tagline: `Stockfish tuned to ${elo}`,
    bio: 'A bot tuned to the exact rating you choose.',
  };
}

export function findBot(id: string): BotProfile | undefined {
  if (id.startsWith('custom-')) {
    const elo = +id.slice(7);
    if (elo >= 100 && elo <= 3200) return customBot(elo);
  }
  return BOTS.find((b) => b.id === id);
}

type Moment = 'greet' | 'blunderByUser' | 'goodByUser' | 'botAdvantage' | 'botWins' | 'userWins' | 'draw' | 'check';

const LINES: Record<Moment, string[]> = {
  greet: ['Hi! Ready to play?', 'Good luck, have fun!', 'Let’s have a great game.', 'I’ve been practising. Watch out!'],
  blunderByUser: ['Ooh, thank you!', 'Are you sure about that?', 'I’ll take that!', 'Hmm, that looks loose.'],
  goodByUser: ['Nice move!', 'Ouch, good one.', 'I didn’t see that coming.', 'Strong!'],
  botAdvantage: ['Things are looking good for me.', 'I like my position.', 'Feeling confident now.'],
  botWins: ['Good game! Want a rematch?', 'GG! Check the review to see what went wrong.', 'That was fun - try again?'],
  userWins: ['Well played! You got me.', 'GG, you deserved that.', 'Congratulations! Rematch?'],
  draw: ['A fair result. Good game!', 'Draw it is. Well played.'],
  check: ['Check!', 'Watch your king!'],
};

const MACHINE: Partial<Record<Moment, string[]>> = {
  greet: ['Engine initialised. Your move, human.', 'Calculating...'],
  blunderByUser: ['Evaluation updated in my favour.'],
  goodByUser: ['Interesting. Recalculating.'],
  botWins: ['Game over. Review recommended.'],
  userWins: ['Impressive. Error logged.'],
  draw: ['Draw. Equilibrium maintained.'],
};

export function botLine(bot: BotProfile, moment: Moment): string {
  const pool = (bot.style === 'machine' && MACHINE[moment]) || LINES[moment];
  return pool[Math.floor(Math.random() * pool.length)];
}
