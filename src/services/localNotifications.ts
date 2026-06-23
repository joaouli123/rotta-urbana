// Local (on-device) notifications for the PASSENGER ride status, so the alert
// shows up in the system tray even when the app is backgrounded — e.g. while we
// look for a driver, and the moment a driver is found.
//
// Push (src/services/push.ts) covers the DRIVER side (server → device, works
// when the app is closed). This file covers the PASSENGER side, posted by the
// app itself. A single reused notification id is updated in place as the ride
// moves through its states, and cleared when the ride ends.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL = 'ride-status';
const RIDE_NOTIF_ID = 'rotta-ride-status';

let channelReady = false;
let permissionAsked = false;

async function ensureChannel() {
  if (Platform.OS !== 'android' || channelReady) return;
  channelReady = true;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Status da corrida',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 200, 120, 200],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      lightColor: '#C1F11D',
    });
  } catch { /* best effort */ }
}

/** Ask for notification permission once (Android 13+ needs POST_NOTIFICATIONS). */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    await ensureChannel();
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    if (permissionAsked) return false;
    permissionAsked = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

async function present(content: Notifications.NotificationContentInput) {
  try {
    await ensureNotificationPermission();
    await Notifications.scheduleNotificationAsync({
      identifier: RIDE_NOTIF_ID, // reused id → updates the same tray entry
      content,
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch { /* never let a notification break a flow */ }
}

/** Ongoing "looking for a driver" notification (sticky on Android). */
export async function showSearchingNotification(detail?: string) {
  await present({
    title: '🔎 Procurando motorista...',
    body: detail || 'Estamos encontrando o melhor motorista para você.',
    sticky: true,        // Android: ongoing, can't be swiped away while searching
    autoDismiss: false,
    sound: false,        // the in-app looping sound already plays; keep tray quiet
    priority: 'high',
    color: '#C1F11D',
  });
}

/** Driver matched — replaces the searching notification, rings + pops. */
export async function showDriverFoundNotification(driver?: { name?: string; vehicle?: string | null; plate?: string | null }) {
  const name = driver?.name?.trim();
  const veh = [driver?.vehicle?.trim(), driver?.plate?.trim()].filter(Boolean).join(' • ');
  const body = name
    ? (veh ? `${name} • ${veh}` : `${name} está indo até você.`)
    : 'Seu motorista está indo até você.';
  await present({
    title: '✅ Motorista a caminho!',
    body,
    sticky: false,
    sound: 'default',
    priority: 'max',
    color: '#C1F11D',
  });
}

/** Generic status update on the same tray entry (e.g. driver arrived). */
export async function showRideStatusNotification(title: string, body: string) {
  await present({ title, body, sticky: false, sound: 'default', priority: 'high', color: '#C1F11D' });
}

/** Remove the ride notification (ride completed / cancelled / left flow). */
export async function clearRideNotification() {
  try { await Notifications.dismissNotificationAsync(RIDE_NOTIF_ID); } catch { /* ignore */ }
  try { await Notifications.cancelScheduledNotificationAsync(RIDE_NOTIF_ID); } catch { /* ignore */ }
}
