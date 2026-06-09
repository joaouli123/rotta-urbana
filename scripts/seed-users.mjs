// Seed demo users (admin / passenger / driver) into the linked Supabase project.
// Idempotent: re-running updates the existing demo users.
//   node --env-file=.env scripts/seed-users.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !SECRET) { console.error("Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY"); process.exit(1); }

const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO = [
  { key: "admin",     email: "admin@rottaurbana.app",     password: "Admin@12345",  full_name: "Admin Rotta",     phone: "+55 11 90000-0001", role: "passenger" /*promoted below*/ },
  { key: "passenger", email: "passageiro@rottaurbana.app", password: "Senha@12345",  full_name: "Passageiro Demo", phone: "+55 11 90000-0002", role: "passenger" },
  { key: "driver",    email: "motorista@rottaurbana.app",  password: "Senha@12345",  full_name: "Motorista Demo",  phone: "+55 11 90000-0003", role: "driver" },
];

async function findUserByEmail(email) {
  // listUsers is paginated; demo set is tiny so first page is fine.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data?.users?.find((u) => u.email === email) ?? null;
}

const ids = {};
for (const u of DEMO) {
  let existing = await findUserByEmail(u.email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: u.password, email_confirm: true,
      user_metadata: { full_name: u.full_name, phone: u.phone, role: u.role },
    });
    console.log(`updated  ${u.key.padEnd(9)} ${u.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
      user_metadata: { full_name: u.full_name, phone: u.phone, role: u.role },
    });
    if (error) { console.error(`create ${u.email} failed:`, error.message); process.exit(1); }
    existing = data.user;
    console.log(`created  ${u.key.padEnd(9)} ${u.email}`);
  }
  ids[u.key] = existing.id;
}

// Promote the admin (signup trigger refuses to self-assign admin).
await admin.from("profiles").update({ role: "admin" }).eq("id", ids.admin);
console.log("promoted admin ->", ids.admin);

// Make the demo driver ready to operate: verified + a vehicle.
await admin.from("drivers").update({ is_verified: true, documents_status: "approved" }).eq("id", ids.driver);
const { data: veh } = await admin.from("vehicles").select("id").eq("driver_id", ids.driver).limit(1);
const vehData = {
  model: "Chevrolet Onix", plate: "RUA1234", year: 2022, color: "Prata",
  type: "sedan", is_primary: true, brand: "Chevrolet", fipe_value: 80000,
  fipe_code: "004445-0", seats: 5,
};
if (!veh || veh.length === 0) {
  await admin.from("vehicles").insert({ driver_id: ids.driver, ...vehData });
  console.log("added vehicle for demo driver (economy+comfort)");
} else {
  await admin.from("vehicles").update(vehData).eq("id", veh[0].id);
  console.log("updated demo vehicle (FIPE/seats)");
}

console.log("\nDemo credentials:");
for (const u of DEMO) console.log(`  ${u.role === "driver" ? "driver   " : u.key === "admin" ? "admin    " : "passenger"}  ${u.email}  /  ${u.password}`);
console.log("\nSeed complete.");
