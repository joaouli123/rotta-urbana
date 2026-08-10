// Push-notification registration for ride alerts (expo-notifications).
// A driver who grants permission gets their Expo push token stored server-side
// (set_push_token RPC); the DB trigger notify_new_ride then pushes them on every
// eligible new ride — so the phone rings even with the app closed/backgrounded.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// Show the alert + play sound even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolveProjectId(): string | undefined {
  return (
    (Constants.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId ??
    undefined
  );
}

/** Ask permission, get the Expo push token, and store it for this user. */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      // MAX-importance channel with the bundled LOUD alert sound, so a new ride
      // rings strongly even when the app is fully closed (only the system sound
      // plays then). New channel id ('rides-v2') because Android caches a
      // channel's sound after first creation — the old 'rides' kept 'default'.
      await Notifications.setNotificationChannelAsync('rides-v2', {
        name: 'Corridas',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'request.wav', // bundled via app.config.js → expo-notifications.sounds
        vibrationPattern: [0, 300, 200, 300, 200, 300],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
      });
      await Notifications.setNotificationChannelAsync('support', {
        name: 'Suporte',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
      });
      await Notifications.setNotificationChannelAsync('ride-status', {
        name: 'Status da corrida',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId = resolveProjectId();
    const resp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = resp?.data;
    if (token) await supabase.rpc('set_push_token', { p_token: token });
  } catch {
    // Best effort — notifications must never crash a flow.
  }
}

/** Clear the stored token (on logout) so a signed-out device stops getting pushes. */
export async function clearPushToken(): Promise<void> {
  try { await supabase.rpc('set_push_token', { p_token: '' }); } catch { /* ignore */ }
}
