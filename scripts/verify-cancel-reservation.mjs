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

const admin = await login("+250788000666");
const other = await login("+250788000777");

const createRes = await rpc("create_group", admin.accessToken, {
  p_name: "Cancel Reservation Test", p_group_type: "rotating", p_contribution_amount: 20000,
  p_frequency: "monthly", p_target_size: 5, p_account_type: "group_owned",
  p_rotation_method: "random", p_approval_threshold: "1", p_is_matching_group: true,
});
const groupId = await createRes.json();
console.log("group:", groupId);

console.log("=== Case 1: cancel before any proof submitted (pending) ===");
const reserveRes = await rpc("reserve_spot", other.accessToken, { p_group_id: groupId });
const reservationId = await reserveRes.json();
assert(reserveRes.status < 300, "reserve_spot succeeds");

const memberCheckRes = await rest(`group_members?group_id=eq.${groupId}&user_id=eq.${other.userId}&select=role`, admin.accessToken);
assert((await memberCheckRes.json()).length === 1, "prospective membership row exists after reserving");

const cancelRes = await rpc("cancel_reservation", other.accessToken, { p_reservation_id: reservationId });
assert(cancelRes.status < 300, "cancel_reservation succeeds while pending");

const afterCancelRes = await rest(`reservations?id=eq.${reservationId}&select=status`, admin.accessToken);
assert((await afterCancelRes.json())[0]?.status === "cancelled", "reservation status is cancelled");

const memberAfterRes = await rest(`group_members?group_id=eq.${groupId}&user_id=eq.${other.userId}&select=role`, admin.accessToken);
assert((await memberAfterRes.json()).length === 0, "prospective membership row removed, spot freed");

const doubleCancelRes = await rpc("cancel_reservation", other.accessToken, { p_reservation_id: reservationId });
assert(doubleCancelRes.status >= 400, "cancelling an already-cancelled reservation is rejected");

console.log("=== Case 2: blocked once confirmed (real money already held) ===");
const reserve2Res = await rpc("reserve_spot", other.accessToken, { p_group_id: groupId });
const reservation2Id = await reserve2Res.json();
await rpc("submit_reservation_proof", other.accessToken, {
  p_reservation_id: reservation2Id, p_transaction_id: "TEST-TXN", p_screenshot_path: "test/path.png",
});
const confirmRes = await rpc("confirm_reservation", admin.accessToken, { p_reservation_id: reservation2Id });
assert(confirmRes.status < 300, "admin confirms the reservation");

const blockedCancelRes = await rpc("cancel_reservation", other.accessToken, { p_reservation_id: reservation2Id });
const blockedBody = await blockedCancelRes.json();
assert(blockedCancelRes.status >= 400, "self-cancel is rejected once the deposit is confirmed");
assert(/mediation/i.test(blockedBody.message ?? ""), "rejection message points at Request Mediation, not a dead end");

console.log("=== Cleanup ===");
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const { createClient } = await import("@supabase/supabase-js");
const adminClient = createClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await adminClient.from("groups").delete().eq("id", groupId);
await adminClient.auth.admin.deleteUser(admin.userId);
await adminClient.auth.admin.deleteUser(other.userId);
console.log("cleaned up. ALL CHECKS PASSED.");
