// Verifies "Contribute from available balance": a member with money in
// their personal Uzuza wallet can pay a pending contribution directly
// from it (no MoMo round-trip), for a uzuza_held group only.
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_OTP = "123456";

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

async function main() {
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login admin + member ---");
  const admin = await loginAs("+250788000111");
  const member = await loginAs("+250788000222");
  await adminClient.from("profiles").update({ phone: "+250788123456" }).eq("id", admin.userId);

  console.log("--- admin creates a group, member joins, group switched to uzuza_held ---");
  const createRes = await rpc("create_group", admin.accessToken, {
    p_name: "Wallet Contribution E2E Group", p_group_type: "rotating", p_contribution_amount: 20000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const groupId = await createRes.json();
  await rpc("join_group", member.accessToken, { p_group_id: groupId });

  // Direct write for the same documented reason as e2e-wallet-payout-credit-check.mjs:
  // switching to uzuza_held via set_account_type is MFA-gated, and real TOTP
  // enrollment is a known, pre-existing GoTrue infra bug on this project's
  // hosted Supabase instance, unrelated to this feature.
  await adminClient.from("groups").update({ account_type: "uzuza_held" }).eq("id", groupId);
  await adminClient.from("custody_consents").insert({ group_id: groupId, user_id: admin.userId });
  await rpc("set_group_momo_number", admin.accessToken, { p_group_id: groupId, p_momo_number: "+250788000999" });

  console.log("--- give the member a completed wallet top-up (20,000 RWF) ---");
  // The ledger-posting trigger only posts a topup on the pending→completed
  // UPDATE transition (mirroring the real MoMo webhook flow), not on a
  // same-transaction completed INSERT — so this goes through both steps,
  // the same way e2e-wallet-payout-credit-check.mjs's real flow does.
  const { data: topupRow } = await adminClient.from("wallet_transactions").insert({
    user_id: member.userId, type: "topup", amount: 20000, status: "pending", phone: "+250788000222",
  }).select("id").single();
  await adminClient.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", topupRow.id);
  const memberStartBalRes = await rpc("get_wallet_balance", member.accessToken, {});
  const memberStartBalance = Number(await memberStartBalRes.json());
  console.log(`  member wallet balance after top-up: ${memberStartBalance} RWF`);
  assert(memberStartBalance === 20000, "member's wallet balance reflects the top-up");

  console.log("--- start cycle ---");
  const cycleRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
  const cycleId = await cycleRes.json();
  const contribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=*`, admin.accessToken);
  const contributions = await contribRes.json();
  const memberContribution = contributions.find((c) => c.member_id === member.userId);
  const adminContribution = contributions.find((c) => c.member_id === admin.userId);

  console.log("--- reject: a group_owned group should refuse contribute_from_wallet ---");
  const otherGroupRes = await rpc("create_group", admin.accessToken, {
    p_name: "Group-Owned Control Group", p_group_type: "rotating", p_contribution_amount: 10000,
    p_frequency: "monthly", p_target_size: 1, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const otherGroupId = await otherGroupRes.json();
  await rpc("set_group_momo_number", admin.accessToken, { p_group_id: otherGroupId, p_momo_number: "+250788000999" });
  const otherCycleRes = await rpc("start_cycle", admin.accessToken, { p_group_id: otherGroupId });
  const otherCycleId = await otherCycleRes.json();
  const otherContribRes = await rest(`contributions?cycle_id=eq.${otherCycleId}&select=*`, admin.accessToken);
  const [otherContribution] = await otherContribRes.json();
  const blockedRes = await rpc("contribute_from_wallet", admin.accessToken, { p_contribution_id: otherContribution.id });
  assert(!blockedRes.ok, "group_owned group rejects contribute_from_wallet");

  console.log("--- reject: paying someone else's contribution should fail ---");
  const wrongUserRes = await rpc("contribute_from_wallet", admin.accessToken, { p_contribution_id: memberContribution.id });
  assert(!wrongUserRes.ok, "non-owner cannot pay another member's contribution");

  console.log("--- reject: insufficient balance should block ---");
  const { data: adminTopupRow } = await adminClient.from("wallet_transactions").insert({
    user_id: admin.userId, type: "topup", amount: 5000, status: "pending", phone: "+250788123456",
  }).select("id").single();
  await adminClient.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", adminTopupRow.id);
  const insufficientRes = await rpc("contribute_from_wallet", admin.accessToken, { p_contribution_id: adminContribution.id });
  assert(!insufficientRes.ok, "insufficient balance (5,000 < 20,000) blocks the payment");
  const adminContribCheckRes = await rest(`contributions?id=eq.${adminContribution.id}&select=status`, admin.accessToken);
  const [adminContribCheck] = await adminContribCheckRes.json();
  assert(adminContribCheck.status === "pending", "admin's contribution still pending after the blocked attempt");

  console.log("--- pay the member's own contribution from wallet balance ---");
  const payRes = await rpc("contribute_from_wallet", member.accessToken, { p_contribution_id: memberContribution.id });
  const payBody = payRes.ok ? null : await payRes.json();
  assert(payRes.ok, `contribute_from_wallet succeeds${payBody ? ` (got: ${JSON.stringify(payBody)})` : ""}`);

  console.log("--- verify contribution confirmed with the right channel ---");
  const confirmedRes = await rest(`contributions?id=eq.${memberContribution.id}&select=*`, admin.accessToken);
  const [confirmed] = await confirmedRes.json();
  assert(confirmed.status === "confirmed", "contribution marked confirmed");
  assert(confirmed.payment_channel === "wallet_balance", "payment_channel recorded as wallet_balance");

  console.log("--- verify member's wallet balance decreased by exactly the contribution amount ---");
  const memberEndBalRes = await rpc("get_wallet_balance", member.accessToken, {});
  const memberEndBalance = Number(await memberEndBalRes.json());
  console.log(`  member wallet balance after paying: ${memberEndBalance} RWF`);
  assert(memberEndBalance === memberStartBalance - Number(memberContribution.amount), "wallet balance decreased by exactly the contribution amount");

  console.log("--- verify it does NOT double-count in the wallet transaction feed ---");
  const txRes = await rpc("get_wallet_transactions", member.accessToken, {});
  const transactions = await txRes.json();
  const matching = transactions.filter((t) => t.kind === "Contribution" && Number(t.amount) === Number(memberContribution.amount) && t.group_name === "Wallet Contribution E2E Group");
  assert(matching.length === 1, "the wallet-funded contribution appears exactly once in the feed, via the existing contributions arm (no separate display arm added for it)");

  console.log("--- verify get_total_uzuza_held() reflects the money moving into custody ---");
  const { data: totalHeld, error: totalHeldError } = await adminClient.rpc("get_total_uzuza_held");
  if (totalHeldError) throw totalHeldError;
  assert(Number(totalHeld) >= Number(memberContribution.amount), "platform total-held figure includes the contribution now sitting in group custody");

  console.log("--- reject: paying an already-confirmed contribution again should fail ---");
  const doubleRes = await rpc("contribute_from_wallet", member.accessToken, { p_contribution_id: memberContribution.id });
  assert(!doubleRes.ok, "cannot pay the same contribution twice");

  console.log("--- Cleanup ---");
  await adminClient.from("wallet_transactions").delete().in("user_id", [member.userId, admin.userId]);
  await adminClient.from("groups").delete().in("id", [groupId, otherGroupId]);
  await adminClient.auth.admin.deleteUser(admin.userId);
  await adminClient.auth.admin.deleteUser(member.userId);
  await adminClient.rpc("purge_orphaned_ledger_test_accounts");
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
