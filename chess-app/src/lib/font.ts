// Inter is bundled with the app (no network needed, including in the APK).
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';

export function loadFont() {
  if (typeof FontFace === 'undefined') return;
  const face = new FontFace('Inter', `url(${interUrl}) format('woff2')`, { weight: '100 900', display: 'swap' });
  face
    .load()
    .then((f) => document.fonts.add(f))
    .catch(() => undefined);
}
