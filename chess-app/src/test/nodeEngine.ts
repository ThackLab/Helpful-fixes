// Test helper: runs the Stockfish WASM build under Node via a child process.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Engine, type Transport } from '../lib/engine/engine';

const ENGINE = fileURLToPath(new URL('../../node_modules/stockfish/bin/stockfish-18-lite-single.js', import.meta.url));

export function nodeTransport(): Transport {
  const child = spawn(process.execPath, [ENGINE], { stdio: ['pipe', 'pipe', 'inherit'] });
  let listener: (l: string) => void = () => {};
  createInterface({ input: child.stdout! }).on('line', (l) => listener(l));
  return {
    post: (cmd) => child.stdin!.write(cmd + '\n'),
    onLine: (cb) => (listener = cb),
    terminate: () => child.kill(),
  };
}

export function nodeEngine(options: Record<string, string | number | boolean> = { Hash: 16 }) {
  return new Engine(nodeTransport(), options);
}
