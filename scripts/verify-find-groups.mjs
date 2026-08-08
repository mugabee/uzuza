import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function login(phone) {
  await fetch(`${BASE}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const res = await fetch(`${BASE}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, token: "123456", type: "sms" }),
  });
  const data = await res.json();
  return { accessToken: data.access_token, userId: data.user?.id };
}

function rest(path, token, options = {}) {
  return fetch(`${BASE}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

function rpc(name, token, body) {
  return rest(`rpc/${name}`, token, { method: "POST", body: JSON.stringify(body ?? {}) });
}

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("  ok: " + msg);
}

const admin = await login("+250788050505");
const other1 = await login("+250788060606");
const other2 = await login("+250788070707");

const { createClient: createAdminClient } = await import("@supabase/supabase-js");
const setupClient = createAdminClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await setupClient.from("profiles").update({ full_name: "Test Admin" }).eq("id", admin.userId);

// Full group: 3/4 filled
const fullerRes = await rpc("create_group", admin.accessToken, {
  p_name: "Almost Full Test", p_group_type: "rotating", p_contribution_amount: 20000,
  p_frequency: "monthly", p_target_size: 4, p_account_type: "group_owned",
  p_rotation_method: "random", p_approval_threshold: "1", p_is_matching_group: true,
});
const fullerGroupId = await fullerRes.json();
await rpc("reserve_spot", other1.accessToken, { p_group_id: fullerGroupId });

// Emptier group: 1/4 filled
const emptierRes = await rpc("create_group", other2.accessToken, {
  p_name: "Just Started Test", p_group_type: "rotating", p_contribution_amount: 20000,
  p_frequency: "monthly", p_target_size: 4, p_account_type: "group_owned",
  p_rotation_method: "random", p_approval_threshold: "1", p_is_matching_group: true,
});
const emptierGroupId = await emptierRes.json();

console.log("=== find_groups returns member_count, admin_name, sorted fullest-first ===");
const findRes = await rpc("find_groups", admin.accessToken, {});
const results = await findRes.json();
const fuller = results.find((g) => g.id === fullerGroupId);
const emptier = results.find((g) => g.id === emptierGroupId);

assert(fuller.member_count === 2, `Almost Full Test has member_count 2 (got ${fuller.member_count})`);
assert(emptier.member_count === 1, `Just Started Test has member_count 1 (got ${emptier.member_count})`);
assert(fuller.admin_name != null, "admin_name is populated");

const fullerIndex = results.findIndex((g) => g.id === fullerGroupId);
const emptierIndex = results.findIndex((g) => g.id === emptierGroupId);
assert(fullerIndex < emptierIndex, "the group closer to filling (2/4) sorts before the emptier one (1/4)");

console.log("=== Cleanup ===");
await setupClient.from("groups").delete().in("id", [fullerGroupId, emptierGroupId]);
await setupClient.auth.admin.deleteUser(admin.userId);
await setupClient.auth.admin.deleteUser(other1.userId);
await setupClient.auth.admin.deleteUser(other2.userId);
console.log("cleaned up. ALL CHECKS PASSED.");
