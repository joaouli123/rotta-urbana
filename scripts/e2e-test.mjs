// End-to-end test against the live Supabase project.
// Exercises the full ride + payment flow and verifies RLS hardening.
//   node --env-file=.env scripts/e2e-test.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { passed++; console.log(`  PASS  ${n}`); } else { failed++; console.log(`  FAIL  ${n}`); } };
const newClient = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

async function signIn(email, password) {
  const c = newClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { c, user: data.user };
}
const one = (d) => Array.isArray(d) ? d[0] : d;

console.log("\n=== Rotta Urbana — E2E test ===\n");

// ── Auth ────────────────────────────────────────────────────────────────────
const { c: pax, user: paxU } = await signIn("passageiro@rottaurbana.app", "Senha@12345");
ok("passenger sign-in", !!paxU);
const { c: drv, user: drvU } = await signIn("motorista@rottaurbana.app", "Senha@12345");
ok("driver sign-in", !!drvU);
const { c: adm, user: admU } = await signIn("admin@rottaurbana.app", "Admin@12345");
ok("admin sign-in", !!admU);

// Make the run idempotent: clear any lingering active rides for the demo users.
const cleanup = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
await cleanup.from("rides")
  .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
  .in("status", ["searching", "driver_found", "driver_on_way", "driver_arrived", "in_progress"])
  .or(`passenger_id.eq.${paxU.id},driver_id.eq.${drvU.id}`);
await cleanup.from("drivers").update({ status: "offline" }).eq("id", drvU.id);

// ── Role / profile reads ─────────────────────────────────────────────────────
{
  const { data } = await pax.from("profiles").select("role").eq("id", paxU.id).single();
  ok("passenger profile role=passenger", data?.role === "passenger");
  const { data: a } = await adm.from("profiles").select("role").eq("id", admU.id).single();
  ok("admin profile role=admin", a?.role === "admin");
}

// ── Fare estimate (authenticated only) ───────────────────────────────────────
{
  const { data, error } = await pax.rpc("fare_estimate", { p_ride_type: "economy", p_distance_km: 5, p_duration_min: 10 });
  ok("fare_estimate returns a price", !error && Number(data) > 0);
}

// ── Request a ride (passenger) ───────────────────────────────────────────────
let rideId;
{
  const { data, error } = await pax.rpc("request_ride", {
    p_origin_lat: -23.561, p_origin_lng: -46.656, p_origin_address: "Av. Paulista, 1000",
    p_dest_lat: -23.5505, p_dest_lng: -46.6333, p_dest_address: "Praça da Sé",
    p_ride_type: "economy", p_payment_method: "pix",
  });
  const ride = one(data);
  rideId = ride?.id;
  ok("request_ride creates a ride (status searching, priced)", !error && ride?.status === "searching" && Number(ride?.price) > 0 && Number(ride?.distance_km) > 0);
}

// ── Driver goes online + accepts ─────────────────────────────────────────────
{
  const { error: locErr } = await drv.rpc("update_driver_location", { p_lat: -23.5612, p_lng: -46.6562, p_heading: 90 });
  ok("driver update_driver_location", !locErr);
  const { error: stErr } = await drv.rpc("set_driver_status", { p_status: "online" });
  ok("verified driver can go online", !stErr);

  // passenger discovers nearby drivers (geo)
  const { data: near, error: nErr } = await pax.rpc("nearby_drivers", { p_lat: -23.561, p_lng: -46.656, p_radius_m: 5000 });
  ok("nearby_drivers finds the online driver", !nErr && Array.isArray(near) && near.some((d) => d.driver_id === drvU.id));

  const { data: acc, error: accErr } = await drv.rpc("accept_ride", { p_ride_id: rideId });
  ok("driver accept_ride -> driver_on_way", !accErr && one(acc)?.status === "driver_on_way" && one(acc)?.driver_id === drvU.id);
}

// ── Live tracking RPCs (map data) ────────────────────────────────────────────
{
  const { data: pts } = await pax.rpc("ride_points", { p_ride_id: rideId });
  ok("passenger reads ride points (route)", !!one(pts) && one(pts).origin_lat != null);
  const { data: dloc } = await pax.rpc("ride_driver_location", { p_ride_id: rideId });
  ok("passenger sees driver live location", !!one(dloc) && one(dloc).lat != null);
  const { data: cp } = await pax.rpc("ride_counterpart", { p_ride_id: rideId });
  ok("passenger sees driver contact (call/chat)", !!one(cp) && !!one(cp).name);

  // in-app chat
  await pax.from("ride_messages").insert({ ride_id: rideId, sender_id: paxU.id, body: "Oi, chego em 2 min" });
  const { data: msgs } = await drv.from("ride_messages").select("body").eq("ride_id", rideId);
  ok("in-app chat works (driver reads passenger msg)", Array.isArray(msgs) && msgs.some((m) => (m.body || "").includes("2 min")));
}

// ── Ride progress + completion ───────────────────────────────────────────────
{
  await drv.rpc("update_ride_status", { p_ride_id: rideId, p_status: "driver_arrived" });
  await drv.rpc("update_ride_status", { p_ride_id: rideId, p_status: "in_progress" });
  const { data, error } = await drv.rpc("update_ride_status", { p_ride_id: rideId, p_status: "completed" });
  ok("driver completes ride", !error && one(data)?.status === "completed");
  const { data: d } = await drv.from("drivers").select("status,total_rides").eq("id", drvU.id).single();
  ok("driver back online + total_rides incremented", d?.status === "online" && d?.total_rides >= 1);
}

// ── Rating ───────────────────────────────────────────────────────────────────
{
  const { error } = await pax.rpc("rate_ride", { p_ride_id: rideId, p_stars: 5, p_comment: "Otimo!" });
  ok("passenger rates the ride", !error);
}

// ── Subscription (real PIX — no simulation) ──────────────────────────────────
{
  const { data: sub } = await drv.from("subscriptions").select("amount,status,due_date").eq("driver_id", drvU.id).single();
  ok("driver subscription exists with an amount (real PIX charge)", !!sub && Number(sub.amount) > 0);
}

// ── Plans, settings, admin gating ────────────────────────────────────────────
{
  const { data: psub, error } = await drv.rpc('set_subscription_plan', { p_plan: 'daily' });
  const s = Array.isArray(psub) ? psub[0] : psub;
  ok('driver can switch to daily plan', !error && s?.plan === 'daily');
  await drv.rpc('set_subscription_plan', { p_plan: 'monthly' }); // restore

  const { data: settings } = await pax.from('app_settings').select('subscription_monthly_amount').eq('id', 1).maybeSingle();
  ok('authenticated can read app_settings', !!settings);

  const { error: kErr } = await pax.rpc('admin_kpis');
  ok('passenger CANNOT call admin_kpis (service-role only)', !!kErr);
}

// ── Category eligibility (FIPE / year / color) ────────────────────────────────
{
  const { data: cats } = await drv.rpc('my_categories');
  ok('driver qualifies for economy', Array.isArray(cats) && cats.includes('economy'));
  ok('driver does NOT qualify for premium (no FIPE/black color)', Array.isArray(cats) && !cats.includes('premium'));

  const { data: pr } = await pax.rpc('request_ride', {
    p_origin_lat: -23.561, p_origin_lng: -46.656, p_origin_address: 'A',
    p_dest_lat: -23.55, p_dest_lng: -46.633, p_dest_address: 'B',
    p_ride_type: 'premium', p_payment_method: 'pix',
  });
  const premiumRide = one(pr);
  ok('premium ride created (eligibility test)', !!premiumRide);
  if (premiumRide) {
    const { error: accErr } = await drv.rpc('accept_ride', { p_ride_id: premiumRide.id });
    ok('driver CANNOT accept a premium ride (vehicle ineligible)', !!accErr);
    await pax.rpc('cancel_ride', { p_ride_id: premiumRide.id });
  }
}

// ── RLS / security negatives ─────────────────────────────────────────────────
{
  // passenger cannot escalate their own role
  const { error } = await pax.from("profiles").update({ role: "admin" }).eq("id", paxU.id).select();
  ok("passenger CANNOT self-promote to admin (RLS blocks)", !!error);

  // passenger can update their own name (positive control)
  const { error: nameErr } = await pax.from("profiles").update({ full_name: "Passageiro Demo" }).eq("id", paxU.id);
  ok("passenger CAN edit own name", !nameErr);

  // passenger cannot read the admin's profile
  const { data: leak } = await pax.from("profiles").select("id").eq("id", admU.id);
  ok("passenger CANNOT read another user's profile", Array.isArray(leak) && leak.length === 0);

  // passenger (not a driver) cannot accept rides
  const { error: accErr } = await pax.rpc("accept_ride", { p_ride_id: rideId });
  ok("passenger CANNOT accept rides", !!accErr);

  // driver cannot self-verify (already verified, but the column must be frozen for users)
  const { error: vErr } = await drv.from("drivers").update({ is_verified: false }).eq("id", drvU.id).select();
  ok("driver CANNOT change own is_verified (RLS freezes it)", !!vErr);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
