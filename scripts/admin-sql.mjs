// Run arbitrary SQL against the linked Supabase project via the Management API.
// Usage:
//   node --env-file=.env scripts/admin-sql.mjs path/to/file.sql
//   echo "select 1;" | node --env-file=.env scripts/admin-sql.mjs
// Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the environment.
import { readFileSync } from "node:fs";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const fileArg = process.argv[2];
const sql = fileArg ? readFileSync(fileArg, "utf8") : readFileSync(0, "utf8");
if (!sql.trim()) { console.error("No SQL provided"); process.exit(1); }

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  },
);
const text = await res.text();
if (!res.ok) { console.error("HTTP", res.status, text); process.exit(1); }
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
catch { console.log(text); }
