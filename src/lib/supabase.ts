import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud during development if the env is missing.
  console.error('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    storage: AsyncStorage,        // persist the session on the device
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,    // not a web redirect flow
  },
});
