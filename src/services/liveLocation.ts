// Live driver position during a ride, like Uber / 99.
//
// Every GPS fix of the driver goes out on a Supabase Realtime broadcast
// channel of the ride, and the passenger's map moves as it arrives (well
// under a second). The database row (drivers.current_location) is still
// written every few seconds: it feeds the passenger's fallback poll, the
// nearby-drivers search and the admin panel.
//
// The fixes come from the ride screen's GPS watch (every second, app open)
// and from the background location task (screen off or another app in
// front). Both call reportDriverFix; close duplicates are dropped.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { updateLocation } from './drivers';

export type LiveFix = { lat: number; lng: number; heading: number | null; speed: number | null; at: number };

const EVENT = 'pos';
const topic = (rideId: string) => `ride-live:${rideId}`;

// ── Driver: publish ────────────────────────────────────────────────────────────

const BROADCAST_MIN_MS = 800;
const DB_MIN_MS = 4_000;
const RIDES_KEY = 'live-location:rides';

// The current ride and, while finishing it, the queued one: both passengers
// follow the car.
const publishers = new Map<string, { channel: RealtimeChannel; joined: boolean }>();
let lastBroadcastAt = 0;
let lastDbAt = 0;

function openPublisher(rideId: string) {
  const entry = { channel: supabase.channel(topic(rideId), { config: { broadcast: { self: false, ack: false } } }), joined: false };
  entry.channel.subscribe((status) => { entry.joined = status === 'SUBSCRIBED'; });
  publishers.set(rideId, entry);
}

function closePublisher(rideId: string) {
  const entry = publishers.get(rideId);
  if (!entry) return;
  publishers.delete(rideId);
  void supabase.removeChannel(entry.channel);
}

/** The rides whose passengers get the driver's fixes; empty ends it. */
export function setLiveRides(rideIds: (string | null | undefined)[]) {
  const wanted = new Set(rideIds.filter((id): id is string => !!id));
  let changed = false;
  for (const id of Array.from(publishers.keys())) if (!wanted.has(id)) { closePublisher(id); changed = true; }
  for (const id of wanted) if (!publishers.has(id)) { openPublisher(id); changed = true; }
  if (!changed) return;
  lastBroadcastAt = 0;
  const ids = Array.from(wanted);
  void (ids.length ? AsyncStorage.setItem(RIDES_KEY, JSON.stringify(ids)) : AsyncStorage.removeItem(RIDES_KEY)).catch(() => {});
}

/** One ride only (or none). */
export function setLiveRide(rideId: string | null) {
  setLiveRides([rideId]);
}

/** One GPS fix of the driver: broadcast to the rides and saved every few seconds. */
export async function reportDriverFix(coords: Pick<Location.LocationObjectCoords, 'latitude' | 'longitude' | 'heading' | 'speed'>) {
  const now = Date.now();
  // The background task can run after the app process was restarted.
  if (!publishers.size) {
    const saved = await AsyncStorage.getItem(RIDES_KEY).catch(() => null);
    if (saved) {
      try { setLiveRides(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }
  const heading = coords.heading != null && coords.heading >= 0 && coords.heading < 360 ? coords.heading : null;
  if (now - lastDbAt >= DB_MIN_MS) {
    lastDbAt = now;
    updateLocation(coords.latitude, coords.longitude, heading ?? undefined).catch(() => { lastDbAt = 0; });
  }
  if (!publishers.size || now - lastBroadcastAt < BROADCAST_MIN_MS) return;
  lastBroadcastAt = now;
  const fix: LiveFix = { lat: coords.latitude, lng: coords.longitude, heading, speed: coords.speed ?? null, at: now };
  for (const { channel, joined } of publishers.values()) {
    // Websocket while joined; REST when it is still (re)connecting, as
    // happens in the background.
    if (joined) channel.send({ type: 'broadcast', event: EVENT, payload: fix }).catch(() => {});
    else channel.httpSend(EVENT, fix).catch(() => {});
  }
}

// ── Driver: background updates ─────────────────────────────────────────────────

export const DRIVER_LOCATION_TASK = 'rotta-driver-location';

// Defined when this module loads (index.ts imports it), so Android finds it
// even when it wakes the app only for the task.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const last = data.locations[data.locations.length - 1];
    await reportDriverFix(last.coords);
  });
}

/**
 * Keeps sending the location with the screen off or another app in front,
 * with the Android notification "Compartilhando sua localização". Asks for
 * "Permitir o tempo todo" once; without it, updates run while the app is open.
 */
export async function startBackgroundTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    let bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted' && bg.canAskAgain) bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2_000,
      distanceInterval: 0,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Rotta Urbana: corrida em andamento',
        notificationBody: 'Compartilhando sua localização com o passageiro.',
        notificationColor: '#16A34A',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundTracking() {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch { /* not running */ }
}

// ── Passenger: listen ──────────────────────────────────────────────────────────

/** Calls onFix for every driver fix of the ride, as it is sent. */
export function subscribeDriverLive(rideId: string, onFix: (fix: LiveFix) => void): () => void {
  let latest = 0;
  const channel = supabase
    .channel(topic(rideId), { config: { broadcast: { self: false } } })
    .on('broadcast', { event: EVENT }, ({ payload }) => {
      const fix = payload as LiveFix;
      if (!Number.isFinite(fix?.lat) || !Number.isFinite(fix?.lng)) return;
      // REST and websocket sends can arrive out of order.
      if (fix.at && fix.at < latest) return;
      latest = fix.at ?? latest;
      onFix(fix);
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
