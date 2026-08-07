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

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

const admin = await login("+250788000888");
const other = await login("+250788000999");

const createRes = await rpc("create_group", admin.accessToken, {
  p_name: "Constitution Gate Test", p_group_type: "rotating", p_contribution_amount: 20000,
  p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
  p_rotation_method: "random", p_approval_threshold: "1", p_is_matching_group: true,
});
const groupId = await createRes.json();
console.log("group:", groupId);

console.log("=== Fill the group without acknowledging ===");
const reserveRes = await rpc("reserve_spot", other.accessToken, { p_group_id: groupId });
const reservationId = await reserveRes.json();

const proofPath = `${reservationId}/test.png`;
await fetch(`${BASE}/storage/v1/object/reservation-proofs/${proofPath}`, {
  method: "POST",
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${other.accessToken}`, "Content-Type": "image/png" },
  body: TINY_PNG,
});
await rpc("submit_reservation_proof", other.accessToken, {
  p_reservation_id: reservationId, p_transaction_id: "TEST-TXN", p_screenshot_path: proofPath,
});
await rpc("confirm_reservation", admin.accessToken, { p_reservation_id: reservationId });

const statusAfterFillRes = await rest(`groups?id=eq.${groupId}&select=status`, admin.accessToken);
const statusAfterFill = (await statusAfterFillRes.json())[0]?.status;
assert(statusAfterFill === "forming", "group stays forming even though it's full — nobody has acknowledged yet");

console.log("=== One member acknowledges, still not enough ===");
await rpc("acknowledge_constitution", other.accessToken, { p_group_id: groupId });
const statusAfterOneRes = await rest(`groups?id=eq.${groupId}&select=status`, admin.accessToken);
assert((await statusAfterOneRes.json())[0]?.status === "forming", "still forming with only one of two acknowledged");

console.log("=== The last member acknowledges, group activates ===");
await rpc("acknowledge_constitution", admin.accessToken, { p_group_id: groupId });
const statusAfterBothRes = await rest(`groups?id=eq.${groupId}&select=status`, admin.accessToken);
assert((await statusAfterBothRes.json())[0]?.status === "active", "group activates the moment the last member acknowledges");

const roleRes = await rest(`group_members?group_id=eq.${groupId}&user_id=eq.${other.userId}&select=role`, admin.accessToken);
assert((await roleRes.json())[0]?.role === "member", "the reserved member was promoted from prospective to member");

console.log("=== Cleanup ===");
const { createClient } = await import("@supabase/supabase-js");
const adminClient = createClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await adminClient.from("groups").delete().eq("id", groupId);
await adminClient.auth.admin.deleteUser(admin.userId);
await adminClient.auth.admin.deleteUser(other.userId);
console.log("cleaned up. ALL CHECKS PASSED.");
