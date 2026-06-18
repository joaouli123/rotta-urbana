// Synthesize the app's UI sound effects as small mono 16-bit WAV files.
// Run: node scripts/gen-sounds.mjs   (regenerates assets/sounds/*.wav)
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 22050;
const OUT = new URL('../assets/sounds/', import.meta.url);
mkdirSync(OUT, { recursive: true });

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

// Add a tone with a soft attack and exponential-ish decay (no clicks).
function tone(arr, startSec, durSec, freq, amp, { attack = 0.006, decay = 0.5, square = 0 } = {}) {
  const start = Math.floor(startSec * SR), len = Math.floor(durSec * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let env = 1;
    if (t < attack) env = t / attack;
    else env = Math.pow(1 - (t - attack) / (durSec - attack), 1 + decay * 4);
    let wsig = Math.sin(2 * Math.PI * freq * t);
    if (square) wsig = (1 - square) * wsig + square * Math.sign(wsig) * 0.7; // brighten
    arr[start + i] = (arr[start + i] || 0) + wsig * amp * Math.max(0, env);
  }
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A5 = 880, D6 = 1174.7;

function buf(sec) { return new Float32Array(Math.ceil(sec * SR)); }

// searching — soft sonar "blip" every 1.4s (loops into a calm pulse)
{
  const a = buf(1.4);
  tone(a, 0.00, 0.13, 720, 0.22, { decay: 0.7 });
  tone(a, 0.00, 0.13, 360, 0.10, { decay: 0.7 });
  writeFileSync(new URL('searching.wav', OUT), wav(a));
}

// found — pleasant ascending 3-note chime
{
  const a = buf(0.75);
  tone(a, 0.00, 0.16, C5, 0.30);
  tone(a, 0.12, 0.16, E5, 0.30);
  tone(a, 0.24, 0.45, G5, 0.34, { decay: 0.3 });
  writeFileSync(new URL('found.wav', OUT), wav(a));
}

// request — bright, attention-grabbing double beep for the DRIVER (loops)
{
  const a = buf(1.5);
  tone(a, 0.00, 0.20, A5, 0.55, { square: 0.35, decay: 0.2 });
  tone(a, 0.00, 0.20, A5 * 2, 0.18, { square: 0.3, decay: 0.2 });
  tone(a, 0.26, 0.24, D6, 0.55, { square: 0.35, decay: 0.2 });
  tone(a, 0.26, 0.24, D6 * 1.5, 0.16, { square: 0.3, decay: 0.2 });
  writeFileSync(new URL('request.wav', OUT), wav(a));
}

// accept — short confirmation pop (rising)
{
  const a = buf(0.4);
  tone(a, 0.00, 0.12, G5, 0.40);
  tone(a, 0.08, 0.22, C6, 0.40, { decay: 0.35 });
  writeFileSync(new URL('accept.wav', OUT), wav(a));
}

// complete — success chime (4 ascending notes, final ring)
{
  const a = buf(1.0);
  tone(a, 0.00, 0.14, C5, 0.30);
  tone(a, 0.12, 0.14, E5, 0.30);
  tone(a, 0.24, 0.14, G5, 0.30);
  tone(a, 0.36, 0.55, C6, 0.34, { decay: 0.25 });
  writeFileSync(new URL('complete.wav', OUT), wav(a));
}

console.log('Sounds written to assets/sounds/: searching, found, request, accept, complete (.wav)');
