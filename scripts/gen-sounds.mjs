// Synthesize the app's UI sound effects as rich, LOUD 16-bit WAV files.
// Run: node scripts/gen-sounds.mjs   (regenerates assets/sounds/*.wav)
//
// The first version was too thin/quiet. This one uses bell/FM-style partials,
// detuned pads, ADSR envelopes and a light feedback reverb, then normalizes to
// ~0.97 peak with a soft-clip so it's full and loud on phone speakers
// (Uber/99 feel). Mono, 44.1 kHz.
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 44100;
const TAU = Math.PI * 2;
const OUT = new URL('../assets/sounds/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI→Hz (A4 = 69)

// ADSR across the full event length.
function env(i, len, { a = 0.01, d = 0.1, s = 0.7, r = 0.2 } = {}) {
  const t = i / SR, total = len / SR, rStart = total - r;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < rStart) return s;
  return Math.max(0, s * (1 - (t - rStart) / r));
}

// Struck-bell tone: a few slightly-inharmonic partials with exp decay.
function bell(out, startSec, freq, dur, gain = 1,
  partials = [[1, 1, 1], [2.01, 0.5, 0.7], [3.01, 0.28, 0.5], [4.7, 0.15, 0.35]]) {
  const start = Math.floor(startSec * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const [mult, amp, decay] of partials) s += amp * Math.sin(TAU * freq * mult * t) * Math.exp(-t * (3.2 / decay));
    out[start + i] += s * gain * Math.min(1, t / 0.004); // soft attack (anti-click)
  }
}

// Warm detuned pad chord with slow tremolo — used for the searching loop.
function pad(out, startSec, freqs, dur, gain = 1, tremHz = 5) {
  const start = Math.floor(startSec * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const f of freqs) {
      s += Math.sin(TAU * f * t);
      s += 0.7 * Math.sin(TAU * (f * 1.004) * t);
      s += 0.7 * Math.sin(TAU * (f * 0.996) * t);
      s += 0.25 * Math.sin(TAU * f * 2 * t);
    }
    const trem = 0.85 + 0.15 * Math.sin(TAU * tremHz * t);
    out[start + i] += s * gain * trem * env(i, len, { a: 0.18, d: 0.2, s: 0.9, r: 0.35 });
  }
}

// Bright urgent square-ish beep (driver alert).
function beep(out, startSec, freq, dur, gain = 1) {
  const start = Math.floor(startSec * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (let h = 1; h <= 7; h += 2) s += (1 / h) * Math.sin(TAU * freq * h * t);
    out[start + i] += s * gain * env(i, len, { a: 0.005, d: 0.02, s: 0.95, r: 0.04 });
  }
}

// Light feedback-delay reverb tail (adds space/richness).
function reverb(data, { delaySec = 0.045, feedback = 0.34, mix = 0.28, taps = 5 } = {}) {
  const out = Float32Array.from(data), d = Math.floor(delaySec * SR);
  for (let tap = 1; tap <= taps; tap++) {
    const off = d * tap, g = mix * Math.pow(feedback, tap - 1);
    for (let i = off; i < out.length; i++) out[i] += data[i - off] * g;
  }
  return out;
}

// Normalize to peak then soft-clip (tanh) → loud but clean. 4 ms edge fades.
function finalize(data, peak = 0.97, drive = 1.1) {
  let max = 1e-9;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  const g = peak / max, out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.tanh(data[i] * g * drive) * peak;
  const f = Math.floor(0.004 * SR);
  for (let i = 0; i < f; i++) { out[i] *= i / f; out[out.length - 1 - i] *= i / f; }
  return out;
}

function writeWav(name, data) {
  const n = data.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    b.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, 44 + i * 2);
  }
  writeFileSync(new URL(name, OUT), b);
  console.log(`✓ ${name}  (${(b.length / 1024).toFixed(0)} KB, ${(n / SR).toFixed(2)}s)`);
}

// ── SEARCHING: calm premium looping pulse (A major swells + sonar ping) ──────
{
  let x = buf(2.6);
  pad(x, 0.0, [note(57), note(61), note(64)], 1.1, 0.10, 4);
  pad(x, 1.3, [note(64), note(68), note(71)], 1.1, 0.09, 4);
  bell(x, 0.05, note(81), 0.7, 0.10);
  bell(x, 1.35, note(85), 0.7, 0.09);
  x = reverb(x, { mix: 0.32, feedback: 0.4 });
  writeWav('searching.wav', finalize(x, 0.85, 1.0)); // a touch softer (it loops)
}

// ── FOUND: triumphant ascending arpeggio (C E G C) bells ─────────────────────
{
  let x = buf(1.5);
  [note(72), note(76), note(79), note(84)].forEach((f, i) => bell(x, i * 0.12, f, 0.9 - i * 0.05, 1.0));
  bell(x, 0.48, note(88), 1.0, 0.9);
  x = reverb(x, { mix: 0.3, feedback: 0.38 });
  writeWav('found.wav', finalize(x, 0.97, 1.15));
}

// ── REQUEST (driver): LOUD urgent rising dispatch alert, loops ───────────────
{
  let x = buf(1.6);
  beep(x, 0.00, note(83), 0.16, 0.9);
  beep(x, 0.20, note(88), 0.16, 0.95);
  beep(x, 0.40, note(91), 0.22, 1.0);
  bell(x, 0.40, note(91), 0.5, 0.5);
  x = reverb(x, { mix: 0.18, feedback: 0.25 });
  writeWav('request.wav', finalize(x, 0.99, 1.25)); // loudest
}

// ── ACCEPT: satisfying confirm pop (rising perfect 4th) ──────────────────────
{
  let x = buf(0.7);
  bell(x, 0.0, note(79), 0.35, 0.9);
  bell(x, 0.1, note(84), 0.55, 1.0);
  x = reverb(x, { mix: 0.22, feedback: 0.3 });
  writeWav('accept.wav', finalize(x, 0.97, 1.15));
}

// ── COMPLETE: celebratory 4-note success jingle ──────────────────────────────
{
  let x = buf(1.8);
  [note(72), note(76), note(79), note(84)].forEach((f, i) => bell(x, i * 0.16, f, 1.0, 1.0));
  bell(x, 0.64, note(91), 1.1, 0.85);
  x = reverb(x, { mix: 0.34, feedback: 0.42 });
  writeWav('complete.wav', finalize(x, 0.97, 1.15));
}

console.log('\nDone → assets/sounds/  (searching, found, request, accept, complete)');
