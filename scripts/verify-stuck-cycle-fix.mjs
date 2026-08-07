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

const admin = await login("+250788010101");
const other = await login("+250788020202");

const createRes = await rpc("create_group", admin.accessToken, {
  p_name: "Stuck Cycle Fix Test", p_group_type: "rotating", p_contribution_amount: 20000,
  p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
  p_rotation_method: "random", p_approval_threshold: "1",
});
const groupId = await createRes.json();
await rpc("join_group", other.accessToken, { p_group_id: groupId });

const cycleRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
const cycleId = await cycleRes.json();
const contribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=*`, admin.accessToken);
const contributions = await contribRes.json();

const adminContribution = contributions.find((c) => c.member_id === admin.userId);
const otherContribution = contributions.find((c) => c.member_id === other.userId);

console.log("=== Admin pays and gets confirmed, other member's payment goes missing ===");
const path = `${adminContribution.id}/test.png`;
await fetch(`${BASE}/storage/v1/object/contribution-proofs/${path}`, {
  method: "POST",
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${admin.accessToken}`, "Content-Type": "image/png" },
  body: TINY_PNG,
});
await rpc("submit_contribution_proof", admin.accessToken, {
  p_contribution_id: adminContribution.id, p_transaction_id: "TEST-TXN", p_screenshot_path: path,
});
await rpc("confirm_contribution", admin.accessToken, {
  p_contribution_id: adminContribution.id, p_approve: true, p_reason: null,
});

console.log("=== Admin reports the other member's payment as missed ===");
const missedRes = await rpc("report_missed_payment", admin.accessToken, {
  p_contribution_id: otherContribution.id, p_fine_amount: 5000,
});
assert(missedRes.status < 300, "report_missed_payment succeeds");

console.log("=== The cycle should now be completed, not stuck ===");
const cycleCheckRes = await rest(`cycles?id=eq.${cycleId}&select=status`, admin.accessToken);
const cycleStatus = (await cycleCheckRes.json())[0]?.status;
assert(cycleStatus === "completed", `cycle status is completed (got ${cycleStatus})`);

console.log("=== The payout can now be requested, and correctly excludes the missed amount ===");
const payoutRes = await rpc("request_payout", admin.accessToken, { p_cycle_id: cycleId });
assert(payoutRes.status < 300, `request_payout succeeds (was previously impossible — cycle never completed)`);
const payoutId = await payoutRes.json();
const payoutCheckRes = await rest(`payout_requests?id=eq.${payoutId}&select=amount`, admin.accessToken);
const payoutAmount = Number((await payoutCheckRes.json())[0]?.amount);
assert(payoutAmount === 20000, `payout amount is 20,000 (only the confirmed contribution, got ${payoutAmount})`);

console.log("=== A new cycle can now be started, group isn't frozen ===");
const cycle2Res = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
assert(cycle2Res.status < 300, "start_cycle succeeds for cycle 2 (previously blocked forever by the stuck cycle 1)");

console.log("=== Cleanup ===");
const { createClient } = await import("@supabase/supabase-js");
const adminClient = createClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await adminClient.from("groups").delete().eq("id", groupId);
await adminClient.auth.admin.deleteUser(admin.userId);
await adminClient.auth.admin.deleteUser(other.userId);
console.log("cleaned up. ALL CHECKS PASSED.");
