// Shared Supabase client helpers for edge functions.
// Resolves keys from BOTH the new format (SUPABASE_SECRET_KEYS / *_PUBLISHABLE_KEYS,
// which are JSON objects) and the legacy single-value env vars, so functions keep
// working whether or not the project has migrated / disabled legacy JWT keys.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function pickKey(jsonEnv: string, legacyEnv: string): string {
  const raw = Deno.env.get(jsonEnv);
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      return obj.default ?? (Object.values(obj)[0] as string) ?? "";
    } catch { /* fall through */ }
  }
  return Deno.env.get(legacyEnv) ?? "";
}

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SECRET_KEY = pickKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
export const PUBLISHABLE_KEY = pickKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");

// Full-access server client (bypasses RLS). Server-side only.
export function adminClient() {
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// RLS-scoped client acting as the calling user (from their JWT).
export function userClient(authHeader: string) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
