import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import type { RouteStep } from './geo';

/** "Em 300 metros" reads better than the "300 m" shown on the banner. */
function spokenDistance(m: number): string {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    if (km === 1) return '1 quilômetro';
    return `${String(km).replace('.', ',')} quilômetros`;
  }
  const rounded = m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10);
  return `${rounded} metros`;
}

function stepText(step: RouteStep): string {
  return step.instruction || (step.name ? `Siga pela ${step.name}` : 'Siga pela rota');
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function say(text: string) {
  // Only the latest instruction matters: drop anything still queued.
  Speech.stop();
  Speech.speak(text, { language: 'pt-BR', rate: 1.0 });
}

/**
 * Spoken turn-by-turn, driven by the same maneuver as the on-screen banner.
 * Each maneuver is announced up to three times: when it becomes the next one
 * ("Em 800 metros, vire à direita..."), when it gets close and again at the turn.
 * The thresholds grow with speed so the warning comes ~20 s and ~5 s ahead.
 */
export function useVoiceGuidance(
  maneuver: { step: RouteStep; distanceM: number } | null,
  speedMs: number,
  enabled: boolean,
) {
  const said = useRef<{ key: string; stage: number }>({ key: '', stage: 0 });

  const step = maneuver?.step;
  // Rerouting rebuilds the steps: a key from the text and place keeps an
  // unchanged maneuver from being announced again.
  const key = step ? `${step.instruction}|${step.location[0].toFixed(4)},${step.location[1].toFixed(4)}` : '';
  const distanceM = maneuver ? Math.round(maneuver.distanceM) : null;

  useEffect(() => {
    if (!enabled || !step || distanceM == null) return;
    // With the app in the background the driver is on Waze/Maps, which talks too.
    if (AppState.currentState !== 'active') return;

    const s = said.current;
    if (s.key !== key) { s.key = key; s.stage = 0; }

    const nowM = Math.max(35, speedMs * 5);
    const soonM = Math.max(200, speedMs * 20);
    const text = stepText(step);

    if (s.stage < 3 && distanceM <= nowM) {
      s.stage = 3;
      say(text);
    } else if (s.stage < 2 && distanceM <= soonM) {
      s.stage = 2;
      say(`Em ${spokenDistance(distanceM)}, ${lowerFirst(text)}`);
    } else if (s.stage < 1 && distanceM > soonM + 150) {
      // Far enough that the "close" warning won't follow right after.
      s.stage = 1;
      say(`Em ${spokenDistance(distanceM)}, ${lowerFirst(text)}`);
    }
  }, [key, distanceM, enabled]);

  useEffect(() => {
    if (!enabled) Speech.stop();
  }, [enabled]);

  useEffect(() => () => { Speech.stop(); }, []);
}
