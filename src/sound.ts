import { useSyncExternalStore } from 'react';

let ctx: AudioContext | null = null;
let on = localStorage.getItem('bleep:sound') !== 'off';
const subs = new Set<() => void>();

export const soundOn = () => on;
export const toggleSound = () => { on = !on; localStorage.setItem('bleep:sound', on ? 'on' : 'off'); subs.forEach(f => f()); if (on) sfx.press(); };
export const useSound = () => useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => on);

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'square', gain = 0.04) {
  if (!on) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const seq = (notes: [number, number][], dur = 0.08, type?: OscillatorType) => notes.forEach(([f, at]) => tone(f, at, dur, type));

export const sfx = {
  press: () => tone(1900, 0, 0.025, 'square', 0.025),
  boot: () => seq([[440, 0], [660, 0.09], [990, 0.18]], 0.07, 'triangle'),
  transmit: () => seq([[1200, 0], [1200, 0.12], [1600, 0.24]], 0.06),
  signal: () => seq([[880, 0], [880, 0.1]], 0.05, 'sine'),
  correct: () => seq([[784, 0], [1047, 0.09]], 0.1, 'triangle'),
  wrong: () => tone(140, 0, 0.28, 'sawtooth', 0.05),
  intercept: () => seq([[1568, 0], [1175, 0.06], [1568, 0.12], [2093, 0.18]], 0.05),
  victory: () => seq([[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [1047, 0.6]], 0.14, 'triangle'),
  bleep: () => tone(1000, 0, 0.35, 'sine', 0.05),
};
