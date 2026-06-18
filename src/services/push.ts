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
      // High-importance channel so ride alerts ring + pop over other apps.
      await Notifications.setNotificationChannelAsync('rides', {
        name: 'Corridas',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
