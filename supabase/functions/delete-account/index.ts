// ============================================================================
// Rotta Urbana — delete-account edge function
// ----------------------------------------------------------------------------
// In-app account deletion, required by Apple (Guideline 5.1.1(v)) and Google
// Play for any app that supports account creation. The caller proves identity
// with their own JWT; we resolve their user id from it (never trust a body id),
// then delete the auth user with the service-role admin API. FK cascades remove
// profiles -> drivers/vehicles/documents/rides/ratings/subscriptions/payments.
// ============================================================================
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing token" }, 401);

  // Identity comes from the JWT, not the request body.
  const { data: userData, error: userErr } = await userClient(authHeader).auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid token" }, 401);
  const userId = userData.user.id;

  // Hard-delete the auth user; ON DELETE CASCADE cleans up all app rows.
  const { error: delErr } = await adminClient().auth.admin.deleteUser(userId);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true });
});
