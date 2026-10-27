import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import { isAndroidApp } from './lib/platform';
import { loadFont } from './lib/font';

loadFont();

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
