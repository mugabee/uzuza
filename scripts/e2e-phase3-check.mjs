// Repeatable Phase 3 regression check: a group with two admins and one
// regular member, approval_threshold 'all' (so completion genuinely
// requires both admins, not just one) — proves the threshold logic really
// blocks early completion, and that a non-admin member can't approve.
// Requires sms_test_otp registered for all three numbers below.
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_OTP = "123456";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function loginAs(phone) {
  await fetch(`${BASE}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const res = await fetch(`${BASE}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, token: TEST_OTP, type: "sms" }),
  });
  const data = await res.json();
  return { accessToken: data.access_token, userId: data.user?.id };
}

function rest(path, accessToken, options = {}) {
  return fetch(`${BASE}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

function rpc(name, accessToken, body) {
  return rest(`rpc/${name}`, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

async function submitAndConfirmContribution(userToken, adminToken, contribution) {
  const path = `${contribution.id}/test.png`;
  await fetch(`${BASE}/storage/v1/object/contribution-proofs/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "image/png",
    },
    body: TINY_PNG,
  });
  await rpc("submit_contribution_proof", userToken, {
    p_contribution_id: contribution.id,
    p_transaction_id: "TEST-TXN",
    p_screenshot_path: path,
  });
  await rpc("confirm_contribution", adminToken, {
    p_contribution_id: contribution.id,
    p_approve: true,
    p_reason: null,
  });
}

async function main() {
  console.log("--- Login three test users ---");
  const admin1 = await loginAs("+250788000111");
  const admin2 = await loginAs("+250788000222");
  const member = await loginAs("+250788000333");
  console.log("admin1:", admin1.userId, "admin2:", admin2.userId, "member:", member.userId);

  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- admin1 creates group (threshold: all, target_size 3) ---");
  const createRes = await rpc("create_group", admin1.accessToken, {
    p_name: "Phase 3 E2E Group",
    p_group_type: "rotating",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 3,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "all",
  });
  const groupId = await createRes.json();
  console.log(createRes.status, groupId);

  console.log("--- admin2 and member join ---");
  await rpc("join_group", admin2.accessToken, { p_group_id: groupId });
  await rpc("join_group", member.accessToken, { p_group_id: groupId });

  console.log("--- test fixture setup: promote admin2 to admin role ---");
  // No user-facing "promote to admin" feature exists yet (that's Phase 8
  // scope) — using the service-role client directly here only to set up
  // the test precondition of multiple admins, not to exercise a feature.
  await adminClient
    .from("group_members")
    .update({ role: "admin" })
    .eq("group_id", groupId)
    .eq("user_id", admin2.userId);

  console.log("--- admin1 sets momo number and starts cycle ---");
  await rpc("set_group_momo_number", admin1.accessToken, {
    p_group_id: groupId,
    p_momo_number: "+250788000999",
  });
  const cycleRes = await rpc("start_cycle", admin1.accessToken, { p_group_id: groupId });
  const cycleId = await cycleRes.json();
  console.log(cycleRes.status, cycleId);

  const contribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=*`, admin1.accessToken);
  const contributions = await contribRes.json();

  console.log("--- all three members submit + admin1 confirms ---");
  for (const c of contributions) {
    const token = [admin1, admin2, member].find((u) => u.userId === c.member_id).accessToken;
    await submitAndConfirmContribution(token, admin1.accessToken, c);
  }

  const cycleCheckRes = await rest(`cycles?id=eq.${cycleId}&select=status`, admin1.accessToken);
  const [cycleCheck] = await cycleCheckRes.json();
  assert(cycleCheck.status === "completed", "cycle auto-completed once all contributions confirmed");

  console.log("--- admin1 requests payout ---");
  const payoutRes = await rpc("request_payout", admin1.accessToken, { p_cycle_id: cycleId });
  const payoutId = await payoutRes.json();
  console.log(payoutRes.status, payoutId);

  console.log("--- member (non-admin) cannot approve ---");
  const memberApproveRes = await rpc("approve_payout", member.accessToken, {
    p_payout_request_id: payoutId,
  });
  assert(memberApproveRes.status >= 400, "non-admin approve_payout call rejected");

  console.log("--- completing before any approval should fail ---");
  const tooEarlyRes = await rpc("complete_payout", admin1.accessToken, {
    p_payout_request_id: payoutId,
    p_transaction_id: "TOO-EARLY",
    p_screenshot_path: "irrelevant",
  });
  assert(tooEarlyRes.status >= 400, "complete_payout rejected before approval threshold met");

  console.log("--- admin1 approves (1 of 2 required for 'all') ---");
  await rpc("approve_payout", admin1.accessToken, { p_payout_request_id: payoutId });
  const afterFirstRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, admin1.accessToken);
  const [afterFirst] = await afterFirstRes.json();
  assert(afterFirst.status === "pending", "still pending after only 1 of 2 admins approved");

  console.log("--- completing with only 1/2 approvals should still fail ---");
  const stillTooEarlyRes = await rpc("complete_payout", admin1.accessToken, {
    p_payout_request_id: payoutId,
    p_transaction_id: "STILL-TOO-EARLY",
    p_screenshot_path: "irrelevant",
  });
  assert(stillTooEarlyRes.status >= 400, "complete_payout still rejected with 1/2 approvals");

  console.log("--- admin2 approves (2 of 2) ---");
  await rpc("approve_payout", admin2.accessToken, { p_payout_request_id: payoutId });
  const afterSecondRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, admin1.accessToken);
  const [afterSecond] = await afterSecondRes.json();
  assert(afterSecond.status === "approved", "flips to approved once both admins approved");

  console.log("--- admin1 completes the payout ---");
  const proofPath = `${payoutId}/test.png`;
  await fetch(`${BASE}/storage/v1/object/payout-proofs/${proofPath}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${admin1.accessToken}`,
      "Content-Type": "image/png",
    },
    body: TINY_PNG,
  });
  const completeRes = await rpc("complete_payout", admin1.accessToken, {
    p_payout_request_id: payoutId,
    p_transaction_id: "FINAL-TXN",
    p_screenshot_path: proofPath,
  });
  assert(completeRes.status < 300, "complete_payout succeeds once approved");

  const finalRes = await rest(`payout_requests?id=eq.${payoutId}&select=*`, admin1.accessToken);
  const [final] = await finalRes.json();
  assert(final.status === "completed", "payout request is completed");
  console.log("final payout:", final);

  console.log("--- Cleanup ---");
  await adminClient.storage.from("payout-proofs").remove([proofPath]);
  await adminClient.storage
    .from("contribution-proofs")
    .remove(contributions.map((c) => `${c.id}/test.png`));
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.auth.admin.deleteUser(admin1.userId);
  await adminClient.auth.admin.deleteUser(admin2.userId);
  await adminClient.auth.admin.deleteUser(member.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
