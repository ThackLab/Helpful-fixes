import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import './styles/themes.css';
import './styles/arena.css';
import { isAndroidApp } from './lib/platform';
import { applyAppearance } from './lib/appearance';
import { useSettings } from './state/settings';

// Apply the saved theme before the first paint, then follow changes.
applyAppearance(useSettings.getState());
useSettings.subscribe((s, prev) => {
  if (
    s.theme !== prev.theme ||
    s.boardTheme !== prev.boardTheme ||
    s.pieceSet !== prev.pieceSet ||
    s.textSize !== prev.textSize ||
    s.colorblind !== prev.colorblind ||
    s.squareNames !== prev.squareNames ||
    s.reduceMotion !== prev.reduceMotion
  )
    applyAppearance(s);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The Android app serves its files from the APK, so it needs no offline cache.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isAndroidApp) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
