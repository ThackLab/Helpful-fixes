// Themes, boards and piece sets. A theme is a complete look: colours (in
// src/styles/themes.css, keyed by data-theme), a headline style, the fonts it
// needs, and the board and pieces it comes with. The board and pieces can be
// changed independently; "auto" follows the theme.
import interUrl from '@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2?url';
import serifUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';
import serifItalicUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url';
import frauncesUrl from '@fontsource-variable/fraunces/files/fraunces-latin-soft-normal.woff2?url';
import frauncesItalicUrl from '@fontsource-variable/fraunces/files/fraunces-latin-soft-italic.woff2?url';
import newsreaderUrl from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url';
import newsreaderItalicUrl from '@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2?url';
import monoUrl from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import atkinsonUrl from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url';
import atkinsonItalicUrl from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-italic.woff2?url';

export type FontId = 'inter' | 'serif' | 'fraunces' | 'newsreader' | 'mono' | 'atkinson';

export type BoardId =
  'mono' | 'green' | 'brown' | 'blue' | 'purple' | 'grey' | 'ice' | 'slate' | 'paper' | 'ocean' | 'royal' | 'rose' | 'contrast' | 'clear';

export type PieceSetId =
  'cburnett' | 'merida' | 'chessnut' | 'spatial' | 'celtic' | 'fantasy' | 'papercut' | 'rhosgfx' | 'kiwen-suwi' | 'totoy' | 'mpchess' | 'firi';

export type ThemeId = 'noir' | 'graphite' | 'club' | 'walnut' | 'paper' | 'ocean' | 'royal' | 'rose' | 'contrast' | 'clear';

/** How headlines are set: an editorial serif, tight heavy sans, or plain sans. */
export type DisplayStyle = 'serif' | 'tight' | 'plain';

export interface Theme {
  id: ThemeId;
  name: string;
  blurb: string;
  display: DisplayStyle;
  fonts: FontId[];
  board: BoardId;
  pieces: PieceSetId;
  /** Light themes get light browser chrome and form controls. */
  light?: boolean;
  /** Shown in the theme list: background, text and accent. */
  swatch: [string, string, string];
  group: 'Dark' | 'Colour' | 'Light' | 'Accessible';
}

export const THEMES: Theme[] = [
  {
    id: 'noir',
    name: 'Noir',
    blurb: 'Pure black with editorial serif headlines.',
    display: 'serif',
    fonts: ['serif'],
    board: 'mono',
    pieces: 'cburnett',
    swatch: ['#000000', '#f5f5f5', '#ffffff'],
    group: 'Dark',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    blurb: 'Tight, heavy type with a silver sheen.',
    display: 'tight',
    fonts: [],
    board: 'slate',
    pieces: 'chessnut',
    swatch: ['#0b0b0c', '#f2f2f3', '#c9c9cf'],
    group: 'Dark',
  },
  {
    id: 'club',
    name: 'Club',
    blurb: 'The classic green tournament board.',
    display: 'plain',
    fonts: [],
    board: 'green',
    pieces: 'merida',
    swatch: ['#262421', '#ffffff', '#81b64c'],
    group: 'Colour',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    blurb: 'Warm wood, cream and amber.',
    display: 'serif',
    fonts: ['fraunces'],
    board: 'brown',
    pieces: 'celtic',
    swatch: ['#17110d', '#f4e9da', '#e0a95c'],
    group: 'Colour',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    blurb: 'Deep navy with an ice-blue board.',
    display: 'tight',
    fonts: [],
    board: 'ocean',
    pieces: 'spatial',
    swatch: ['#07101c', '#eaf2ff', '#4cc9f0'],
    group: 'Colour',
  },
  {
    id: 'royal',
    name: 'Royal',
    blurb: 'Midnight purple and gold.',
    display: 'serif',
    fonts: ['serif'],
    board: 'royal',
    pieces: 'fantasy',
    swatch: ['#0f0a17', '#f3eefb', '#e7c27d'],
    group: 'Colour',
  },
  {
    id: 'rose',
    name: 'Rose',
    blurb: 'Dusk pink, soft and bold.',
    display: 'serif',
    fonts: ['fraunces'],
    board: 'rose',
    pieces: 'papercut',
    swatch: ['#160d12', '#fff0f5', '#ff8fab'],
    group: 'Colour',
  },
  {
    id: 'paper',
    name: 'Paper',
    blurb: 'Ink on ivory, like a chess book.',
    display: 'serif',
    fonts: ['newsreader'],
    board: 'paper',
    pieces: 'mpchess',
    light: true,
    swatch: ['#f5f0e6', '#1c1a17', '#1c1a17'],
    group: 'Light',
  },
  {
    id: 'contrast',
    name: 'High contrast',
    blurb: 'Black, white and yellow. Nothing faint.',
    display: 'plain',
    fonts: [],
    board: 'contrast',
    pieces: 'cburnett',
    swatch: ['#000000', '#ffffff', '#ffd60a'],
    group: 'Accessible',
  },
  {
    id: 'clear',
    name: 'Visual aid',
    blurb: 'Larger, clearer type, colour-blind safe colours and named squares.',
    display: 'plain',
    fonts: ['atkinson'],
    board: 'clear',
    pieces: 'kiwen-suwi',
    swatch: ['#101418', '#f5f7fa', '#ffcc00'],
    group: 'Accessible',
  },
];

export const BOARDS: { id: BoardId; name: string; light: string; dark: string }[] = [
  { id: 'mono', name: 'Mono', light: '#e6e6e6', dark: '#9e9e9e' },
  { id: 'slate', name: 'Slate', light: '#dfe3e8', dark: '#8b95a1' },
  { id: 'green', name: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'brown', name: 'Wood', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', name: 'Blue', light: '#eae9d2', dark: '#4b7399' },
  { id: 'ocean', name: 'Ice', light: '#e3eef6', dark: '#7096b8' },
  { id: 'ice', name: 'Sky', light: '#dbe9f4', dark: '#7ca6c4' },
  { id: 'purple', name: 'Purple', light: '#efefef', dark: '#8877b7' },
  { id: 'royal', name: 'Royal', light: '#ece6f5', dark: '#8a75b5' },
  { id: 'rose', name: 'Rose', light: '#fbe4ea', dark: '#d98aa0' },
  { id: 'paper', name: 'Paper', light: '#f7f3ea', dark: '#c2b59c' },
  { id: 'grey', name: 'Grey', light: '#dcdcdc', dark: '#8a8a8a' },
  { id: 'contrast', name: 'Contrast', light: '#ffffff', dark: '#7a7a7a' },
  { id: 'clear', name: 'Clear', light: '#e8edf2', dark: '#7d8fa3' },
];

export const PIECE_SETS: { id: PieceSetId; name: string; credit: string }[] = [
  { id: 'cburnett', name: 'Classic', credit: 'Colin M.L. Burnett, GPLv2+' },
  { id: 'merida', name: 'Tournament', credit: 'Armando Hernandez Marroquin, GPLv2+' },
  { id: 'chessnut', name: 'Modern', credit: 'Alexis Luengas, Apache 2.0' },
  { id: 'spatial', name: 'Sculpted', credit: 'Maurizio Monge, MIT' },
  { id: 'celtic', name: 'Celtic', credit: 'Maurizio Monge, MIT' },
  { id: 'fantasy', name: 'Fantasy', credit: 'Maurizio Monge, MIT' },
  { id: 'papercut', name: 'Papercut', credit: 'Nikolay Anzarov, CC BY 4.0' },
  { id: 'firi', name: 'Gilded', credit: 'James Faure, CC BY 4.0' },
  { id: 'rhosgfx', name: 'Terracotta', credit: 'RhosGFX, CC0' },
  { id: 'kiwen-suwi', name: 'Bold', credit: 'neverRare, CC BY 4.0' },
  { id: 'totoy', name: 'Totoy', credit: 'Kosal Sen, CC BY 4.0' },
  { id: 'mpchess', name: 'Print', credit: 'Maxime Chupin, GPLv3+' },
];

export const themeOf = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];

const FONT_FILES: Record<FontId, { family: string; normal: string; italic?: string; weight: string }> = {
  inter: { family: 'Inter', normal: interUrl, weight: '100 900' },
  serif: { family: 'Instrument Serif', normal: serifUrl, italic: serifItalicUrl, weight: '400' },
  fraunces: { family: 'Fraunces', normal: frauncesUrl, italic: frauncesItalicUrl, weight: '100 900' },
  newsreader: { family: 'Newsreader', normal: newsreaderUrl, italic: newsreaderItalicUrl, weight: '200 800' },
  mono: { family: 'JetBrains Mono', normal: monoUrl, weight: '100 800' },
  atkinson: { family: 'Atkinson Hyperlegible Next', normal: atkinsonUrl, italic: atkinsonItalicUrl, weight: '200 800' },
};

const loaded = new Set<FontId>();

/** Loads fonts from the bundle (no network needed, including in the APK). */
export function loadFonts(ids: FontId[]) {
  if (typeof FontFace === 'undefined') return;
  for (const id of ids) {
    if (loaded.has(id)) continue;
    loaded.add(id);
    const f = FONT_FILES[id];
    const faces = [new FontFace(f.family, `url(${f.normal}) format('woff2')`, { weight: f.weight, display: 'swap' })];
    if (f.italic) faces.push(new FontFace(f.family, `url(${f.italic}) format('woff2')`, { weight: f.weight, style: 'italic', display: 'swap' }));
    for (const face of faces)
      face
        .load()
        .then((ff) => document.fonts.add(ff))
        .catch(() => undefined);
  }
}

/** Every theme's fonts, for the theme previews. */
export const loadAllFonts = () => loadFonts(Object.keys(FONT_FILES) as FontId[]);

const ROLES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' } as const;

/**
 * CSS for every piece set: board pieces under [data-pieces] and the small
 * figurines used in move notation (.fig-wN etc). The images load only when used.
 */
function pieceCss(): string {
  const base = new URL('pieces/', document.baseURI).href;
  const out: string[] = [];
  for (const { id } of PIECE_SETS)
    for (const c of ['w', 'b'] as const)
      for (const [letter, role] of Object.entries(ROLES)) {
        const url = `url('${base}${id}/${c}${letter}.svg')`;
        // Classic is also bundled as the default for pieces outside any [data-pieces].
        out.push(
          `[data-pieces='${id}'] piece.${role}.${c === 'w' ? 'white' : 'black'}, [data-pieces='${id}'] .fig-${c}${letter} { background-image: ${url}; }`,
        );
      }
  return out.join('\n');
}

let pieceStyle: HTMLStyleElement | null = null;

export interface AppearanceSettings {
  theme: ThemeId;
  boardTheme: BoardId | 'auto';
  pieceSet: PieceSetId | 'auto';
  textSize: 'm' | 'l' | 'xl';
  colorblind: boolean;
  squareNames: boolean;
  reduceMotion: boolean;
}

export const resolveBoard = (s: Pick<AppearanceSettings, 'theme' | 'boardTheme'>): BoardId =>
  s.boardTheme === 'auto' ? themeOf(s.theme).board : s.boardTheme;
export const resolvePieces = (s: Pick<AppearanceSettings, 'theme' | 'pieceSet'>): PieceSetId =>
  s.pieceSet === 'auto' ? themeOf(s.theme).pieces : s.pieceSet;

/** Applies a theme and the accessibility options to the whole app. */
export function applyAppearance(s: AppearanceSettings) {
  const t = themeOf(s.theme);
  const root = document.documentElement;
  root.dataset.theme = t.id;
  root.dataset.display = t.display;
  root.dataset.pieces = resolvePieces(s);
  root.dataset.text = s.textSize;
  root.toggleAttribute('data-colorblind', s.colorblind || t.id === 'clear');
  root.toggleAttribute('data-reduce-motion', s.reduceMotion);
  root.style.colorScheme = t.light ? 'light' : 'dark';
  loadFonts(['inter', 'mono', ...t.fonts]);
  if (!pieceStyle) {
    pieceStyle = document.createElement('style');
    pieceStyle.id = 'piece-sets';
    pieceStyle.textContent = pieceCss();
    document.head.appendChild(pieceStyle);
  }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || t.swatch[0]);
}
