// Cria um usuário gerente sem expor a service role key ao aplicativo.
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";

type ManagerType = "city" | "network";

function cleanText(value: unknown, max = 120): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeEmail(value: unknown): string {
  return cleanText(value, 180).toLowerCase();
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))];
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 60)).filter((item) => /^[0-9a-f-]{36}$/i.test(item)))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "missing token" }, 401);

  const callerClient = userClient(authorization);
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) return json({ error: "invalid token" }, 401);

  const admin = adminClient();
  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerData.user.id)
    .single();
  if (profileError || callerProfile?.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const fullName = cleanText(body.fullName);
  const email = normalizeEmail(body.email);
  const phone = cleanText(body.phone, 30);
  const password = String(body.password ?? "");
  const managerType: ManagerType = body.managerType === "network" ? "network" : "city";
  const cities = uniqueStrings(body.cities);
  const driverIds = uniqueIds(body.driverIds);

  if (fullName.length < 2) return json({ error: "nome inválido" }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "e-mail inválido" }, 400);
  if (password.length < 8) return json({ error: "a senha deve ter pelo menos 8 caracteres" }, 400);
  if (managerType === "city" && cities.length === 0 && driverIds.length === 0) {
    return json({ error: "informe ao menos uma cidade ou um motorista" }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: phone || null,
      role: "manager",
    },
  });
  if (createError || !created.user) return json({ error: createError?.message ?? "não foi possível criar o usuário" }, 400);

  const profileId = created.user.id;
  let managerId: string | null = null;
  try {
    const { data: manager, error: managerError } = await admin
      .from("managers")
      .insert({
        profile_id: profileId,
        city: cities[0] ?? "Toda a rede",
        assigned_by: callerData.user.id,
        manager_type: managerType,
        previous_role: "passenger",
        is_active: true,
      })
      .select("id")
      .single();
    if (managerError || !manager) throw new Error(managerError?.message ?? "não foi possível criar o gerente");
    managerId = manager.id;

    if (cities.length > 0) {
      const { error: citiesError } = await admin.from("manager_cities").insert(
        cities.map((city) => ({ manager_id: manager.id, city })),
      );
      if (citiesError) throw new Error(citiesError.message);
    }

    if (driverIds.length > 0) {
      const { data: validDrivers, error: driversError } = await admin
        .from("drivers")
        .select("id")
        .in("id", driverIds);
      if (driversError) throw new Error(driversError.message);
      if ((validDrivers?.length ?? 0) !== driverIds.length) throw new Error("um ou mais motoristas são inválidos");

      const { error: linksError } = await admin.from("manager_drivers").insert(
        driverIds.map((driverId) => ({ manager_id: manager.id, driver_id: driverId, assigned_by: callerData.user.id })),
      );
      if (linksError) throw new Error(linksError.message);
    }

    await admin.from("manager_audit_log").insert({
      manager_id: manager.id,
      actor_id: callerData.user.id,
      action: "create_account",
      details: { manager_type: managerType, cities, driver_ids: driverIds },
    });
  } catch (error) {
    // Never leave an auth user without the corresponding app records.
    await admin.auth.admin.deleteUser(profileId);
    return json({ error: error instanceof Error ? error.message : "não foi possível configurar o gerente" }, 400);
  }

  return json({ ok: true, manager_id: managerId, profile_id: profileId });
});
