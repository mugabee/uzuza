import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const { error } = await supabase.auth.getSession();
console.log("URL:", env.NEXT_PUBLIC_SUPABASE_URL);
console.log("Anon client reachable:", !error);
if (error) console.log("Error:", error.message);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
const { error: adminError } = await admin
  .from("_nonexistent_probe_table_")
  .select("*")
  .limit(1);
// Any structured Postgres error (not a network/auth failure) confirms the
// service_role key authenticates correctly against the real project.
// PGRST205 = "table not found" from PostgREST, which only happens after
// successful auth — confirms the service_role key is valid for this project.
console.log("Service-role key authenticates:", adminError?.code === "PGRST205");
