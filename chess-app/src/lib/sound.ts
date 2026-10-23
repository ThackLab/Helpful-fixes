// Tiny synthesised sound effects (no audio files needed).
import { useSettings } from '../state/settings';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useSettings.getState().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function knock(freq: number, dur: number, gain = 0.25, type: OscillatorType = 'triangle', when = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.2, when = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  const src = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export type SoundKind = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'end' | 'start' | 'illegal' | 'correct' | 'wrong' | 'lowtime';

export function playSound(kind: SoundKind) {
  switch (kind) {
    case 'move':
      knock(420, 0.07, 0.3);
      noise(0.03, 0.15);
      break;
    case 'capture':
      knock(300, 0.09, 0.35);
      noise(0.06, 0.3);
      break;
    case 'check':
      knock(660, 0.12, 0.25, 'square');
      break;
    case 'castle':
      knock(420, 0.06, 0.3);
      knock(380, 0.06, 0.3, 'triangle', 0.09);
      break;
    case 'promote':
      knock(520, 0.1, 0.2, 'sine');
      knock(780, 0.14, 0.2, 'sine', 0.08);
      break;
    case 'start':
      knock(523, 0.12, 0.15, 'sine');
      knock(784, 0.18, 0.15, 'sine', 0.1);
      break;
    case 'end':
      knock(784, 0.15, 0.18, 'sine');
      knock(523, 0.3, 0.18, 'sine', 0.14);
      break;
    case 'correct':
      knock(660, 0.1, 0.18, 'sine');
      knock(990, 0.18, 0.18, 'sine', 0.08);
      break;
    case 'wrong':
      knock(200, 0.25, 0.2, 'sawtooth');
      break;
    case 'illegal':
      knock(160, 0.1, 0.15, 'square');
      break;
    case 'lowtime':
      knock(880, 0.05, 0.12, 'square');
      break;
  }
}

export function soundForSan(san: string): SoundKind {
  if (san.includes('#')) return 'check';
  if (san.includes('+')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('=')) return 'promote';
  if (san.includes('x')) return 'capture';
  return 'move';
}
