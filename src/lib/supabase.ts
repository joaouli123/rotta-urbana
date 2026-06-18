import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

// Timeout on every Supabase request — prevents infinite spinners on flaky mobile
// networks where the TCP connection opens but never gets a response.
// Storage uploads/downloads (document photos) and edge functions legitimately
// take much longer than a REST call — especially on cellular — so they get a
// generous timeout instead of the 15s used for normal queries. A 15s cap on a
// document upload was aborting attachments on mobile data.
const resolveUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url ?? '';

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = resolveUrl(input as RequestInfo | URL);
  const isHeavy = url.includes('/storage/v1/') || url.includes('/functions/v1/');
  const timeoutMs = isHeavy ? 90_000 : 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input as RequestInfo, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: fetchWithTimeout },
});
