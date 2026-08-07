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

async function submitAndConfirm(memberToken, adminToken, contribution) {
  const path = `${contribution.id}/test.png`;
  await fetch(`${BASE}/storage/v1/object/contribution-proofs/${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${memberToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  await rpc("submit_contribution_proof", memberToken, {
    p_contribution_id: contribution.id, p_transaction_id: "TEST-TXN", p_screenshot_path: path,
  });
  return rpc("confirm_contribution", adminToken, {
    p_contribution_id: contribution.id, p_approve: true, p_reason: null,
  });
}

const admin = await login("+250788001111");
const other = await login("+250788002222");

const createRes = await rpc("create_group", admin.accessToken, {
  p_name: "Celebration Visual Test", p_group_type: "rotating", p_contribution_amount: 20000,
  p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
  p_rotation_method: "random", p_approval_threshold: "1",
});
const groupId = await createRes.json();
await rpc("join_group", other.accessToken, { p_group_id: groupId });

const cycleRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
const cycleId = await cycleRes.json();
const contribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=*`, admin.accessToken);
const contributions = await contribRes.json();
for (const c of contributions) {
  const token = [admin, other].find((u) => u.userId === c.member_id).accessToken;
  await submitAndConfirm(token, admin.accessToken, c);
}

const payoutRes = await rpc("request_payout", admin.accessToken, { p_cycle_id: cycleId });
const payoutId = await payoutRes.json();
await rpc("approve_payout", admin.accessToken, { p_payout_request_id: payoutId });
const proofPath = `${payoutId}/test.png`;
await fetch(`${BASE}/storage/v1/object/payout-proofs/${proofPath}`, {
  method: "POST",
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${admin.accessToken}`, "Content-Type": "image/png" },
  body: TINY_PNG,
});
await rpc("complete_payout", admin.accessToken, {
  p_payout_request_id: payoutId, p_transaction_id: "PAYOUT-TXN", p_screenshot_path: proofPath,
});

console.log("=== Verify the exact data GroupLedger would compute the celebration from ===");
const finalContribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=amount,status`, admin.accessToken);
const finalContributions = await finalContribRes.json();
const totalSaved = finalContributions.filter((c) => c.status === "confirmed").reduce((s, c) => s + Number(c.amount), 0);
const disputeCount = finalContributions.filter((c) => c.status === "missed").length;
assert(totalSaved === 40000, `total saved computes to 40,000 RWF (got ${totalSaved})`);
assert(disputeCount === 0, `dispute count is 0 (got ${disputeCount})`);

const payoutCheckRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, admin.accessToken);
const payoutStatus = (await payoutCheckRes.json())[0]?.status;
assert(payoutStatus === "completed", `payout status is completed (got ${payoutStatus}) — this is exactly the condition GroupLedger checks to show the celebration card`);

console.log("=== Cleanup ===");
const { createClient } = await import("@supabase/supabase-js");
const adminClient = createClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await adminClient.from("groups").delete().eq("id", groupId);
await adminClient.auth.admin.deleteUser(admin.userId);
await adminClient.auth.admin.deleteUser(other.userId);
console.log("cleaned up. ALL CHECKS PASSED.");
