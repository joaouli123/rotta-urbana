// Lightweight UI sound-effects manager (expo-audio, imperative — no hooks).
// Players are created lazily and reused. All calls are best-effort: audio must
// never crash a flow, so every call is wrapped in try/catch.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const SOURCES = {
  searching: require('../../assets/sounds/searching.wav'),
  found: require('../../assets/sounds/found.wav'),
  request: require('../../assets/sounds/request.wav'),
  accept: require('../../assets/sounds/accept.wav'),
  complete: require('../../assets/sounds/complete.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let audioModeReady = false;

function ensureMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  // Play alerts even with the iOS ring/silent switch off (driver must hear it).
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
}

function getPlayer(name: SoundName): AudioPlayer | null {
  try {
    if (!players[name]) players[name] = createAudioPlayer(SOURCES[name]);
    return players[name] ?? null;
  } catch {
    return null;
  }
}

/** Play a sound from the start. Pass loop:true for searching/request alerts. */
export function playSound(name: SoundName, opts: { loop?: boolean; volume?: number } = {}) {
  ensureMode();
  const p = getPlayer(name);
  if (!p) return;
  try {
    p.loop = opts.loop ?? false;
    if (opts.volume != null) p.volume = opts.volume;
    p.seekTo(0);
    p.play();
  } catch { /* never let audio break a flow */ }
}

/** Stop and rewind a (usually looping) sound. */
export function stopSound(name: SoundName) {
  const p = players[name];
  if (!p) return;
  try { p.pause(); p.seekTo(0); } catch { /* ignore */ }
}
