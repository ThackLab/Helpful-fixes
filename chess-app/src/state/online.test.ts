import { beforeEach, describe, expect, it, vi } from 'vitest';

const published: { code: string; state: { n: number; m: string[] } }[] = [];
vi.mock('../lib/online/relay', () => ({
  newCode: () => 'TESTCODE00',
  relay: {
    publishState: async (code: string, state: { n: number; m: string[] }) => void published.push({ code, state }),
    onStatus: () => () => {},
    join: async () => () => {},
    beat: async () => {},
  },
}));
vi.mock('../lib/sound', () => ({ playSound: () => {}, soundForSan: () => 'move' }));
vi.mock('../lib/storage/db', () => ({ saveGame: async () => {} }));

const { useOnline, timeLeft } = await import('./online');
type Wire = NonNullable<ReturnType<typeof useOnline.getState>['games'][number]['s']>;

const game = () => useOnline.getState().games.find((g) => g.code === 'TESTCODE00')!;
const with_ = (patch: Partial<Wire>): Wire => ({ ...game().s!, ...patch });

describe('online games', () => {
  beforeEach(() => {
    useOnline.setState({ games: [] });
    published.length = 0;
  });

  it('plays a game: join, moves both ways, and rejects forgeries', () => {
    const st = useOnline.getState();
    st.create({ tc: null, color: 'w', name: 'Alice' });
    expect(game().me).toBe('w');
    // The guest joins.
    st.receive('TESTCODE00', with_({ n: 2, b: 'Bob' }));
    expect(game().s!.b).toBe('Bob');
    expect(st.move('TESTCODE00', 'e2e4')).toBe(true);
    expect(game().s!.n).toBe(3);
    // Black can't be moved from here.
    expect(st.move('TESTCODE00', 'e7e5')).toBe(false);
    st.receive('TESTCODE00', with_({ n: 4, m: ['e2e4', 'e7e5'] }));
    expect(game().s!.m).toEqual(['e2e4', 'e7e5']);
    // A message that also makes a move for us is ignored.
    st.receive('TESTCODE00', with_({ n: 5, m: ['e2e4', 'e7e5', 'd2d4', 'd7d5'] }));
    expect(game().s!.m).toHaveLength(2);
    // So is one that rewrites history, and our state is sent again.
    published.length = 0;
    st.receive('TESTCODE00', with_({ n: 9, m: ['d2d4', 'd7d5'] }));
    expect(game().s!.m).toEqual(['e2e4', 'e7e5']);
    expect(published).toHaveLength(1);
    // An illegal move is ignored.
    st.receive('TESTCODE00', with_({ n: 9, m: ['e2e4', 'e7e5', 'e1e5'] }));
    expect(game().s!.n).toBe(4);
    // An older copy from the relay makes us resend ours.
    published.length = 0;
    st.receive('TESTCODE00', with_({ n: 2, m: ['e2e4'] }));
    expect(published.map((p) => p.state.n)).toEqual([4]);
  });

  it('takes the free seat, or watches when both are taken', () => {
    const st = useOnline.getState();
    st.open('TESTCODE00');
    st.receive('TESTCODE00', { v: 1, n: 1, host: 'b', w: '', b: 'Carol', tc: null, m: [] });
    st.join('TESTCODE00', 'Dan');
    expect(game().me).toBe('w');
    expect(game().s!.w).toBe('Dan');

    useOnline.setState({ games: [] });
    st.open('TESTCODE00');
    st.receive('TESTCODE00', { v: 1, n: 3, host: 'b', w: 'Dan', b: 'Carol', tc: null, m: [] });
    st.join('TESTCODE00', 'Eve');
    expect(game().me).toBeNull();
  });

  it('runs the clock from the second move and flags at zero', () => {
    const st = useOnline.getState();
    st.create({ tc: { initial: 60_000, increment: 0 }, color: 'w', name: 'Alice' });
    st.receive('TESTCODE00', with_({ n: 2, b: 'Bob' }));
    st.move('TESTCODE00', 'e2e4');
    st.receive('TESTCODE00', with_({ n: 4, m: ['e2e4', 'e7e5'] }));
    const g = game();
    // White to move: the clock runs from when Black's move arrived.
    expect(timeLeft(g, 'w', g.turnAt + 10_000)).toBe(50_000);
    expect(timeLeft(g, 'b', g.turnAt + 10_000)).toBe(60_000);
    st.flag('TESTCODE00', 'w');
    expect(game().s!.r).toBe('0-1');
    expect(game().s!.t).toBe('timeout');
  });

  it('agrees a draw and offers a rematch with colours swapped', () => {
    const st = useOnline.getState();
    st.create({ tc: null, color: 'w', name: 'Alice' });
    st.receive('TESTCODE00', with_({ n: 2, b: 'Bob' }));
    st.move('TESTCODE00', 'e2e4');
    st.receive('TESTCODE00', with_({ n: 4, m: ['e2e4', 'e7e5'], d: 'b' }));
    st.answerDraw('TESTCODE00', true);
    expect(game().s!.r).toBe('1/2-1/2');
    const next = st.rematch('TESTCODE00', 'Alice');
    expect(next).toBeTruthy();
    expect(game().s!.re).toBe(next);
  });
});
