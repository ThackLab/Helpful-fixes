import { describe, expect, it } from 'vitest';
import { mainline, parsePgn, promoteVariation, writePgn } from './pgn';

const SAMPLE = `[Event "Casual"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

{Opening comment} 1. e4 e5 (1... c5 2. Nf3 (2. c3) 2... d6) 2. Nf3 $1 Nc6 3. Bb5 {The Ruy Lopez} a6?! 4.Ba4 Nf6 5. O-O 1-0

[Event "Second"]
[Result "*"]

1. d4 d5 2. c4 *`;

describe('PGN', () => {
  it('parses multiple games with variations, comments and NAGs', () => {
    const games = parsePgn(SAMPLE);
    expect(games).toHaveLength(2);
    const g = games[0];
    expect(g.errors).toEqual([]);
    expect(g.result).toBe('1-0');
    expect(g.headers.White).toBe('Alice');
    const line = mainline(g.tree);
    expect(line.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
    expect(line[2].nags).toEqual([1]);
    expect(line[4].comment).toBe('The Ruy Lopez');
    expect(line[5].nags).toEqual([6]);
    const e4 = line[0];
    expect(e4.children).toHaveLength(2);
    const sicilian = g.tree.nodes[e4.children[1]];
    expect(sicilian.san).toBe('c5');
    const nf3 = g.tree.nodes[sicilian.children[0]];
    expect(nf3.children.map((c) => g.tree.nodes[c].san)).toEqual(['d6']);
    expect(g.tree.nodes[sicilian.children[0]].san).toBe('Nf3');
    expect(sicilian.children.map((c) => g.tree.nodes[c].san)).toEqual(['Nf3', 'c3']);
    expect(games[1].tree.nodes[games[1].tree.rootId].children).toHaveLength(1);
  });

  it('round-trips through the writer', () => {
    const g = parsePgn(SAMPLE)[0];
    const text = writePgn(g.tree, { result: g.result });
    expect(text).toContain('(1... c5 2. Nf3 (2. c3) 2... d6)');
    const again = parsePgn(text)[0];
    expect(mainline(again.tree).map((n) => n.san)).toEqual(mainline(g.tree).map((n) => n.san));
  });

  it('promotes variations', () => {
    const g = parsePgn(SAMPLE)[0];
    const e4 = mainline(g.tree)[0];
    const promoted = promoteVariation(g.tree, e4.children[1]);
    expect(
      mainline(promoted)
        .map((n) => n.san)
        .slice(0, 3),
    ).toEqual(['e4', 'c5', 'Nf3']);
  });

  it('handles FEN setups and bad moves', () => {
    const [g] = parsePgn('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 2. Qh5 *');
    expect(mainline(g.tree).map((n) => n.san)).toEqual(['e4', 'Kd7']);
    expect(g.errors.length).toBe(1);
  });
});
