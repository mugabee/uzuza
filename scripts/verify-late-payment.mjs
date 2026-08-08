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

const admin = await login("+250788030303");
const other = await login("+250788040404");

const createRes = await rpc("create_group", admin.accessToken, {
  p_name: "Late Payment Test", p_group_type: "rotating", p_contribution_amount: 20000,
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

console.log("=== Set up a stuck-and-recovered cycle: admin confirmed, other missed ===");
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
await rpc("report_missed_payment", admin.accessToken, {
  p_contribution_id: otherContribution.id, p_fine_amount: 5000,
});

const fundBeforeRes = await rest(`groups?id=eq.${groupId}&select=safety_fund_balance`, admin.accessToken);
const fundBefore = Number((await fundBeforeRes.json())[0].safety_fund_balance);
assert(fundBefore === 0, `safety fund starts at 0 (got ${fundBefore})`);

console.log("=== Member without money can't submit late payment yet (only 'missed' contributions qualify) ===");
const wrongStateRes = await rpc("submit_late_payment_proof", other.accessToken, {
  p_contribution_id: adminContribution.id, p_transaction_id: "X", p_screenshot_path: "x/y.png",
});
assert(wrongStateRes.status >= 400, "submitting late payment for someone else's already-confirmed contribution is rejected");

console.log("=== Member submits late payment proof for their own missed contribution ===");
const latePath = `${otherContribution.id}/late.png`;
await fetch(`${BASE}/storage/v1/object/contribution-proofs/${latePath}`, {
  method: "POST",
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${other.accessToken}`, "Content-Type": "image/png" },
  body: TINY_PNG,
});
const submitLateRes = await rpc("submit_late_payment_proof", other.accessToken, {
  p_contribution_id: otherContribution.id, p_transaction_id: "LATE-TXN", p_screenshot_path: latePath,
});
assert(submitLateRes.status < 300, "submit_late_payment_proof succeeds");

const afterSubmitRes = await rest(`contributions?id=eq.${otherContribution.id}&select=status`, admin.accessToken);
assert((await afterSubmitRes.json())[0]?.status === "late_submitted", "contribution status is late_submitted");

console.log("=== Another member can't confirm it (admin-only) ===");
const nonAdminConfirmRes = await rpc("confirm_late_payment", other.accessToken, {
  p_contribution_id: otherContribution.id, p_approve: true, p_reason: null,
});
assert(nonAdminConfirmRes.status >= 400, "a non-admin cannot confirm a late payment");

console.log("=== Admin rejects first, contribution goes back to missed and can be resubmitted ===");
await rpc("confirm_late_payment", admin.accessToken, {
  p_contribution_id: otherContribution.id, p_approve: false, p_reason: "Wrong reference",
});
const afterRejectRes = await rest(`contributions?id=eq.${otherContribution.id}&select=status`, admin.accessToken);
assert((await afterRejectRes.json())[0]?.status === "missed", "rejected late payment goes back to missed, not stuck");

console.log("=== Member resubmits, admin approves this time ===");
console.log("  (waiting 6s for the 5s rate-limit window)");
await new Promise((r) => setTimeout(r, 6000));
const resubmitRes = await rpc("submit_late_payment_proof", other.accessToken, {
  p_contribution_id: otherContribution.id, p_transaction_id: "LATE-TXN-2", p_screenshot_path: latePath,
});
assert(resubmitRes.status < 300, `resubmit succeeds after the rate-limit window (status ${resubmitRes.status})`);
const approveRes = await rpc("confirm_late_payment", admin.accessToken, {
  p_contribution_id: otherContribution.id, p_approve: true, p_reason: null,
});
assert(approveRes.status < 300, "admin approves the late payment");

const finalContribRes = await rest(`contributions?id=eq.${otherContribution.id}&select=status`, admin.accessToken);
assert((await finalContribRes.json())[0]?.status === "paid_late", "contribution status is paid_late");

const fundAfterRes = await rest(`groups?id=eq.${groupId}&select=safety_fund_balance`, admin.accessToken);
const fundAfter = Number((await fundAfterRes.json())[0].safety_fund_balance);
assert(fundAfter === 25000, `safety fund now holds 25,000 RWF (20,000 owed + 5,000 fine, got ${fundAfter})`);

console.log("=== Cleanup ===");
const { createClient } = await import("@supabase/supabase-js");
const adminClient = createClient(BASE, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await adminClient.from("groups").delete().eq("id", groupId);
await adminClient.auth.admin.deleteUser(admin.userId);
await adminClient.auth.admin.deleteUser(other.userId);
console.log("cleaned up. ALL CHECKS PASSED.");
