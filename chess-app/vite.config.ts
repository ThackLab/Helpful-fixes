/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation lets the browser use the multi-threaded Stockfish
// build locally. Deployed builds fall back to the single-threaded engine when
// the host can't send these headers (e.g. GitHub Pages).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
