// Repeatable Phase 8 regression check against the real deployed backend.
// Two groups: one exercises proposals (settings + admin succession),
// bulk confirmation, payouts, and exit requests; a second, separate
// small group isolates the safety-fund-buffer + missed-payment-with-
// fund-coverage path, since that needs its own clean balance to verify.
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
  return rest(`rpc/${name}`, accessToken, { method: "POST", body: JSON.stringify(body) });
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

async function submitAndConfirm(accessToken, adminToken, contribution) {
  const path = `${contribution.id}/test.png`;
  await fetch(`${BASE}/storage/v1/object/contribution-proofs/${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  await rpc("submit_contribution_proof", accessToken, {
    p_contribution_id: contribution.id, p_transaction_id: "TEST-TXN", p_screenshot_path: path,
  });
  await rpc("confirm_contribution", adminToken, {
    p_contribution_id: contribution.id, p_approve: true, p_reason: null,
  });
}

async function main() {
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login three test users ---");
  const admin1 = await loginAs("+250788000111");
  const member2 = await loginAs("+250788000222");
  const member3 = await loginAs("+250788000333");
  await adminClient.from("profiles").update({ phone: "+250788123456" }).eq("id", admin1.userId);
  await adminClient.from("profiles").update({ phone: "+250788123457" }).eq("id", member2.userId);

  console.log("=== GROUP 1: proposals, bulk confirm, payout, exit, pause, mediation ===");
  const createRes = await rpc("create_group", admin1.accessToken, {
    p_name: "Phase 8 E2E Group 1", p_group_type: "rotating", p_contribution_amount: 20000,
    p_frequency: "monthly", p_target_size: 3, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const group1Id = await createRes.json();
  await rpc("join_group", member2.accessToken, { p_group_id: group1Id });
  await rpc("join_group", member3.accessToken, { p_group_id: group1Id });
  await rpc("set_group_momo_number", admin1.accessToken, { p_group_id: group1Id, p_momo_number: "+250788000999" });

  console.log("--- propose + approve a role change (admin succession) ---");
  const roleProposalRes = await rpc("propose_group_change", admin1.accessToken, {
    p_group_id: group1Id, p_change_type: "role_change",
    p_payload: { target_user_id: member2.userId, new_role: "admin" },
  });
  const roleProposalId = await roleProposalRes.json();
  await rpc("approve_group_change", admin1.accessToken, { p_proposal_id: roleProposalId });
  const roleCheckRes = await rest(
    `group_members?group_id=eq.${group1Id}&user_id=eq.${member2.userId}&select=role`,
    admin1.accessToken,
  );
  const [roleCheck] = await roleCheckRes.json();
  assert(roleCheck.role === "admin", "role_change proposal actually promoted member2 to admin");

  console.log("--- raise the threshold to 'all' with 2 admins now present ---");
  const thresholdProposalRes = await rpc("propose_group_change", admin1.accessToken, {
    p_group_id: group1Id, p_change_type: "settings", p_payload: { approval_threshold: "all" },
  });
  await rpc("approve_group_change", admin1.accessToken, { p_proposal_id: await thresholdProposalRes.json() });
  const thresholdCheckRes = await rest(`groups?id=eq.${group1Id}&select=approval_threshold`, admin1.accessToken);
  const [thresholdCheck] = await thresholdCheckRes.json();
  assert(thresholdCheck.approval_threshold === "all", "threshold proposal applied with a single admin at the time");

  console.log("--- a settings change now genuinely needs both admins ---");
  const amountProposalRes = await rpc("propose_group_change", admin1.accessToken, {
    p_group_id: group1Id, p_change_type: "settings", p_payload: { contribution_amount: 25000 },
  });
  const amountProposalId = await amountProposalRes.json();
  await rpc("approve_group_change", admin1.accessToken, { p_proposal_id: amountProposalId });
  const midCheckRes = await rest(`groups?id=eq.${group1Id}&select=contribution_amount`, admin1.accessToken);
  const [midCheck] = await midCheckRes.json();
  assert(Number(midCheck.contribution_amount) === 20000, "not yet applied with only 1 of 2 admins approved");

  await rpc("approve_group_change", member2.accessToken, { p_proposal_id: amountProposalId });
  const finalCheckRes = await rest(`groups?id=eq.${group1Id}&select=contribution_amount`, admin1.accessToken);
  const [finalCheck] = await finalCheckRes.json();
  assert(Number(finalCheck.contribution_amount) === 25000, "applied once both admins approved");

  console.log("--- cycle 1: bulk-confirm all three in a loop ---");
  const cycle1Res = await rpc("start_cycle", admin1.accessToken, { p_group_id: group1Id });
  const cycle1Id = await cycle1Res.json();
  const contrib1Res = await rest(`contributions?cycle_id=eq.${cycle1Id}&select=*`, admin1.accessToken);
  const contributions1 = await contrib1Res.json();
  for (const c of contributions1) {
    const token = [admin1, member2, member3].find((u) => u.userId === c.member_id).accessToken;
    await submitAndConfirm(token, admin1.accessToken, c);
  }
  const cycle1CheckRes = await rest(`cycles?id=eq.${cycle1Id}&select=status,recipient_user_id`, admin1.accessToken);
  const [cycle1Check] = await cycle1CheckRes.json();
  assert(cycle1Check.status === "completed", "cycle 1 completed via bulk confirmation");
  const recipientId = cycle1Check.recipient_user_id;

  console.log("--- request/approve/complete the payout (both admins) ---");
  const payoutRes = await rpc("request_payout", admin1.accessToken, { p_cycle_id: cycle1Id });
  const payoutId = await payoutRes.json();
  await rpc("approve_payout", admin1.accessToken, { p_payout_request_id: payoutId });
  await rpc("approve_payout", member2.accessToken, { p_payout_request_id: payoutId });
  const proofPath = `${payoutId}/test.png`;
  await fetch(`${BASE}/storage/v1/object/payout-proofs/${proofPath}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${admin1.accessToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  await rpc("complete_payout", admin1.accessToken, {
    p_payout_request_id: payoutId, p_transaction_id: "PAYOUT-TXN", p_screenshot_path: proofPath,
  });

  console.log("--- start cycle 2 so the recipient's exit request shows a real fine ---");
  const cycle2StartRes = await rpc("start_cycle", admin1.accessToken, { p_group_id: group1Id });
  assert(cycle2StartRes.status < 300, `cycle 2 started (${cycle2StartRes.status}: ${JSON.stringify(await cycle2StartRes.clone().json())})`);

  const recipientUser = [admin1, member2, member3].find((u) => u.userId === recipientId);
  const nonRecipientUser = [admin1, member2, member3].find((u) => u.userId !== recipientId && u !== recipientUser);

  console.log("--- exit request: past recipient gets a non-zero fine ---");
  const recipientExitRes = await rpc("request_exit", recipientUser.accessToken, { p_group_id: group1Id });
  const recipientExitId = await recipientExitRes.json();
  const recipientExitCheckRes = await rest(`exit_requests?id=eq.${recipientExitId}&select=*`, admin1.accessToken);
  const [recipientExitCheck] = await recipientExitCheckRes.json();
  assert(Number(recipientExitCheck.fine_amount) > 0, "past recipient's exit fine is non-zero");

  console.log("--- exit request: never-received member gets zero fine ---");
  const otherExitRes = await rpc("request_exit", nonRecipientUser.accessToken, { p_group_id: group1Id });
  const otherExitCheckRes = await rest(`exit_requests?id=eq.${await otherExitRes.json()}&select=*`, admin1.accessToken);
  const [otherExitCheck] = await otherExitCheckRes.json();
  assert(Number(otherExitCheck.fine_amount) === 0, "member who never received the pot owes no fine");

  console.log("--- admin decides the recipient's exit ---");
  await rpc("decide_exit", admin1.accessToken, { p_exit_request_id: recipientExitId, p_approve: true });
  const membershipRes = await rest(
    `group_members?group_id=eq.${group1Id}&user_id=eq.${recipientId}&select=membership_status`,
    admin1.accessToken,
  );
  const [membership] = await membershipRes.json();
  assert(membership.membership_status === "exited", "membership_status updated to exited");

  console.log("--- missed payment, no safety fund: stays flagged, no auto-resolution ---");
  const cycle2ContribRes = await rest(
    `contributions?group_id=eq.${group1Id}&status=eq.pending&select=*`,
    admin1.accessToken,
  );
  const [missedContribution] = await cycle2ContribRes.json();
  await rpc("report_missed_payment", admin1.accessToken, {
    p_contribution_id: missedContribution.id, p_fine_amount: 5000,
  });
  const missedCheckRes = await rest(`contributions?id=eq.${missedContribution.id}&select=*`, admin1.accessToken);
  const [missedCheck] = await missedCheckRes.json();
  assert(missedCheck.status === "missed", "contribution marked missed");
  assert(Number(missedCheck.missed_fine_amount) === 5000, "fine recorded");

  console.log("--- pause request ---");
  const pauseRes = await rpc("request_pause", member3.accessToken, { p_group_id: group1Id, p_reason: "traveling" });
  const pauseId = await pauseRes.json();
  await rpc("decide_pause", admin1.accessToken, { p_pause_request_id: pauseId, p_approve: true });
  const pauseMembershipRes = await rest(
    `group_members?group_id=eq.${group1Id}&user_id=eq.${member3.userId}&select=membership_status`,
    admin1.accessToken,
  );
  const [pauseMembership] = await pauseMembershipRes.json();
  assert(pauseMembership.membership_status === "paused", "membership_status updated to paused");

  console.log("--- mediation ---");
  const mediationRes = await rpc("request_mediation", member3.accessToken, {
    p_group_id: group1Id, p_reason: "Dispute about a confirmed payment",
  });
  const mediationId = await mediationRes.json();
  const mediationCheckRes = await rest(`mediation_cases?id=eq.${mediationId}&select=*`, admin1.accessToken);
  const [mediationCheck] = await mediationCheckRes.json();
  assert(mediationCheck.status === "open", "mediation case recorded and open");

  console.log("=== GROUP 2: safety-fund buffer + missed payment WITH fund coverage ===");
  const create2Res = await rpc("create_group", admin1.accessToken, {
    p_name: "Phase 8 E2E Group 2", p_group_type: "rotating", p_contribution_amount: 20000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const group2Id = await create2Res.json();
  await rpc("set_safety_fund_type", admin1.accessToken, { p_group_id: group2Id, p_safety_fund_type: "buffer" });
  await rpc("join_group", member2.accessToken, { p_group_id: group2Id });
  await rpc("set_group_momo_number", admin1.accessToken, { p_group_id: group2Id, p_momo_number: "+250788000999" });

  const g2Cycle1Res = await rpc("start_cycle", admin1.accessToken, { p_group_id: group2Id });
  const g2Cycle1Id = await g2Cycle1Res.json();
  const g2Contrib1Res = await rest(`contributions?cycle_id=eq.${g2Cycle1Id}&select=*`, admin1.accessToken);
  const g2Contributions1 = await g2Contrib1Res.json();
  assert(Number(g2Contributions1[0].amount) === 21500, "buffer surcharge applied: 20000 * 1.075");

  for (const c of g2Contributions1) {
    const token = [admin1, member2].find((u) => u.userId === c.member_id).accessToken;
    await submitAndConfirm(token, admin1.accessToken, c);
  }
  const g2GroupRes = await rest(`groups?id=eq.${group2Id}&select=safety_fund_balance`, admin1.accessToken);
  const [g2Group] = await g2GroupRes.json();
  assert(Number(g2Group.safety_fund_balance) === 3000, "safety fund grew by 2 * (20000 * 0.075) = 3000");

  const g2Cycle1CheckRes = await rest(`cycles?id=eq.${g2Cycle1Id}&select=recipient_user_id`, admin1.accessToken);
  const [g2Cycle1Check] = await g2Cycle1CheckRes.json();
  const g2RecipientId = g2Cycle1Check.recipient_user_id;

  const g2PayoutRes = await rpc("request_payout", admin1.accessToken, { p_cycle_id: g2Cycle1Id });
  const g2PayoutId = await g2PayoutRes.json();
  await rpc("approve_payout", admin1.accessToken, { p_payout_request_id: g2PayoutId });
  const g2ProofPath = `${g2PayoutId}/test.png`;
  await fetch(`${BASE}/storage/v1/object/payout-proofs/${g2ProofPath}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${admin1.accessToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  await rpc("complete_payout", admin1.accessToken, {
    p_payout_request_id: g2PayoutId, p_transaction_id: "G2-PAYOUT", p_screenshot_path: g2ProofPath,
  });

  console.log("--- cycle 2: the past recipient misses payment, fund covers it ---");
  const g2Cycle2StartRes = await rpc("start_cycle", admin1.accessToken, { p_group_id: group2Id });
  assert(g2Cycle2StartRes.status < 300, "group 2 cycle 2 started");
  const g2Cycle2ContribRes = await rest(
    `contributions?group_id=eq.${group2Id}&status=eq.pending&member_id=eq.${g2RecipientId}&select=*`,
    admin1.accessToken,
  );
  const [g2MissedContribution] = await g2Cycle2ContribRes.json();
  await rpc("report_missed_payment", admin1.accessToken, {
    p_contribution_id: g2MissedContribution.id, p_fine_amount: 2000,
  });
  const g2GroupAfterRes = await rest(`groups?id=eq.${group2Id}&select=safety_fund_balance`, admin1.accessToken);
  const [g2GroupAfter] = await g2GroupAfterRes.json();
  assert(Number(g2GroupAfter.safety_fund_balance) === 1000, "fund drew down by the 2000 fine (3000 - 2000 = 1000)");

  console.log("--- Cleanup ---");
  await adminClient.storage.from("contribution-proofs").remove(
    [...contributions1, ...g2Contributions1].map((c) => `${c.id}/test.png`),
  );
  await adminClient.storage.from("payout-proofs").remove([proofPath, g2ProofPath]);
  await adminClient.from("groups").delete().in("id", [group1Id, group2Id]);
  await adminClient.auth.admin.deleteUser(admin1.userId);
  await adminClient.auth.admin.deleteUser(member2.userId);
  await adminClient.auth.admin.deleteUser(member3.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
