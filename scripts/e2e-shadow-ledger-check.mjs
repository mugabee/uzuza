// Repeatable regression check for Stage A of the double-entry ledger
// redesign (see docs/ledger-redesign-analysis.md) against the real
// deployed backend. This is a SHADOW ledger — nothing in the app reads
// from it — so verification means: every real money-moving event that
// should produce a posting actually does, every posting balances, the
// account_balances projection matches the posting history, and a
// deliberately-malformed posting is rejected outright.
//
// Uses momo_confirm_contribution (the service-role confirmation path)
// rather than the interactive confirm_contribution RPC, because the
// latter requires a verified TOTP/aal2 session for uzuza_held groups
// (Phase 10 MFA gating) and this Supabase project's TOTP enrollment is
// known-broken (see CLAUDE.md's Phase 10 notes) — momo_confirm_contribution
// has no such gate, matching how the real MoMo Collections webhook path
// actually confirms contributions.
//
// Requires sms_test_otp set in Supabase's auth config. Cleans up all
// test data it creates on success.
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_OTP = "123456";

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

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
  if (!data.access_token) throw new Error(`login failed for ${phone}: ${JSON.stringify(data)}`);
  return { accessToken: data.access_token, userId: data.user.id };
}

function rpc(name, accessToken, body) {
  return fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
}

async function postingsFor(admin, table, id) {
  const { data } = await admin
    .from("ledger_postings")
    .select("id, source_event, ledger_posting_lines(direction, amount, ledger_accounts(account_type, owner_user_id, owner_group_id))")
    .eq("source_table", table)
    .eq("source_id", id);
  return data ?? [];
}

async function balanceOf(admin, accountType, ownerUserId, ownerGroupId) {
  let q = admin.from("ledger_accounts").select("id").eq("account_type", accountType);
  q = ownerUserId ? q.eq("owner_user_id", ownerUserId) : q.is("owner_user_id", null);
  q = ownerGroupId ? q.eq("owner_group_id", ownerGroupId) : q.is("owner_group_id", null);
  const { data: acct } = await q.maybeSingle();
  if (!acct) return 0;
  const { data: bal } = await admin.from("ledger_account_balances").select("balance").eq("account_id", acct.id).maybeSingle();
  return Number(bal?.balance ?? 0);
}

async function main() {
  const admin = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login test users, grant one staff access ---");
  const groupAdmin = await loginAs("+250788000555");
  const member = await loginAs("+250788000666");
  const staffer = await loginAs("+250788000777");
  await admin.from("staff_users").insert({ user_id: staffer.userId });

  let groupId;
  try {
    // Baseline the coverage-gap counters before this run's own writes.
    // Rows created by earlier project phases (before this migration
    // existed) will always show as "missing a posting" — that's a real,
    // expected, disclosed gap for Stage B (backfill) to close later, not
    // something this test should fail on. What this test verifies is
    // that no *new* gaps appear from here on.
    const baselineRes = await rpc("get_shadow_ledger_integrity_report", staffer.accessToken);
    const baseline = (await baselineRes.json())[0] ?? {
      custody_ledger_rows_missing_posting: 0,
      wallet_topup_completed_missing_posting: 0,
      wallet_payout_credit_missing_posting: 0,
      wallet_withdrawal_missing_posting: 0,
    };

    console.log("--- Core write-function correctness (isolated, no domain flow needed) ---");
    const unbalancedRes = await admin.rpc("post_ledger_entry", {
      p_source_event: "test_unbalanced",
      p_source_table: "test",
      p_source_id: groupAdmin.userId,
      p_memo: "should be rejected",
      p_lines: [
        { account_type: "external_momo_collections", direction: "debit", amount: 100 },
        { account_type: "user_wallet", owner_user_id: groupAdmin.userId, direction: "credit", amount: 50 },
      ],
    });
    assert(!!unbalancedRes.error, "post_ledger_entry rejects an unbalanced posting (debit 100 vs credit 50)");

    const acctId1 = await admin.rpc("get_or_create_ledger_account", { p_account_type: "user_wallet", p_owner_user_id: groupAdmin.userId });
    const acctId2 = await admin.rpc("get_or_create_ledger_account", { p_account_type: "user_wallet", p_owner_user_id: groupAdmin.userId });
    assert(!acctId1.error && !acctId2.error && acctId1.data === acctId2.data, "get_or_create_ledger_account is idempotent for the same owner");

    console.log("--- Append-only enforcement on postings/lines/accounts ---");
    const { data: onePosting } = await admin.from("ledger_postings").select("id").limit(1);
    if (onePosting?.length) {
      const upd = await admin.from("ledger_postings").update({ memo: "tampered" }).eq("id", onePosting[0].id);
      assert(!!upd.error, "UPDATE against ledger_postings is rejected");
    }

    console.log("--- Set up a real uzuza_held + buffer-fund group ---");
    const createRes = await rpc("create_group", groupAdmin.accessToken, {
      p_name: "Shadow Ledger E2E Group", p_group_type: "rotating", p_contribution_amount: 20000,
      p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
      p_rotation_method: "random", p_approval_threshold: "1",
    });
    groupId = await createRes.json();
    await rpc("join_group", member.accessToken, { p_group_id: groupId });
    // set_account_type itself requires a verified aal2/TOTP session when
    // switching to uzuza_held (Phase 10 MFA gating) — this Supabase
    // project's TOTP enrollment is known-broken (CLAUDE.md's Phase 10
    // notes), so set_account_type isn't callable by any test script
    // right now. Not what this test is exercising anyway — set the
    // group's account_type directly via the service role instead.
    const { error: acctTypeErr } = await admin.from("groups").update({ account_type: "uzuza_held" }).eq("id", groupId);
    assert(!acctTypeErr, `group switched to uzuza_held directly (service role, MFA-gated RPC not usable in this environment)`);
    const fundRes = await rpc("set_safety_fund_type", groupAdmin.accessToken, {
      p_group_id: groupId, p_safety_fund_type: "buffer",
    });
    assert(fundRes.status < 300, "buffer safety fund enabled");

    const cycleRes = await rpc("start_cycle", groupAdmin.accessToken, { p_group_id: groupId });
    assert(cycleRes.status < 300, `cycle started (status ${cycleRes.status})`);

    const { data: contributions } = await admin
      .from("contributions")
      .select("id, member_id, amount")
      .eq("group_id", groupId);
    assert(contributions.length === 2, "two contributions created (buffer-inflated: 20000 * 1.075 = 21500)");
    assert(Number(contributions[0].amount) === 21500, "contribution amount correctly inflated by the 7.5% buffer");

    const adminContribution = contributions.find((c) => c.member_id === groupAdmin.userId);
    const memberContribution = contributions.find((c) => c.member_id === member.userId);

    console.log("--- Confirm the admin's own contribution via momo_confirm_contribution (no MFA gate) ---");
    const ref = `TEST-REF-${Date.now()}`;
    await admin.from("contributions").update({
      payment_channel: "momo_collections", collection_reference_id: ref, status: "submitted",
    }).eq("id", adminContribution.id);

    const confirmRes = await admin.rpc("momo_confirm_contribution", {
      p_contribution_id: adminContribution.id, p_reference_id: ref,
    });
    assert(!confirmRes.error, `momo_confirm_contribution succeeded (${confirmRes.error?.message ?? ""})`);

    const custodyInflowPostings = await postingsFor(admin, "custody_ledger", null);
    const { data: custodyRow } = await admin.from("custody_ledger").select("id, amount").eq("contribution_id", adminContribution.id).single();
    const custodyPosting = (await postingsFor(admin, "custody_ledger", custodyRow.id))[0];
    assert(!!custodyPosting && custodyPosting.source_event === "custody_inflow", "custody_ledger insert automatically produced a custody_inflow posting");
    assert(Number(custodyRow.amount) === 21500, "custody_ledger row holds the full 21500 (buffer-inflated) contribution");

    const custodyBalance = await balanceOf(admin, "group_custody", null, groupId);
    const safetyFundBalance = await balanceOf(admin, "group_safety_fund", null, groupId);
    assert(custodyBalance === 21500 - 1500, `group_custody shadow balance is 20000 after the 1500 buffer skim (got ${custodyBalance})`);
    assert(safetyFundBalance === 1500, `group_safety_fund shadow balance is 1500 = 20000 * 0.075 (got ${safetyFundBalance})`);

    const { data: groupRow } = await admin.from("groups").select("safety_fund_balance").eq("id", groupId).single();
    assert(Number(groupRow.safety_fund_balance) === 1500, "shadow ledger's safety fund balance matches the legacy groups.safety_fund_balance column exactly");

    console.log("--- report_missed_payment draws from the safety fund (manufacturing a completed payout so recipient_paid=true) ---");
    const { data: cycleRow } = await admin.from("cycles").select("id").eq("group_id", groupId).single();
    await admin.from("payout_requests").insert({
      cycle_id: cycleRow.id, group_id: groupId, recipient_user_id: member.userId, amount: 20000,
      status: "completed", requested_by: groupAdmin.userId, transaction_id: "FAKE-TEST-PAYOUT", completed_at: new Date().toISOString(),
    });

    const missedRes = await rpc("report_missed_payment", groupAdmin.accessToken, {
      p_contribution_id: memberContribution.id, p_fine_amount: 1000,
    });
    assert(missedRes.status < 300, `report_missed_payment succeeded (status ${missedRes.status})`);

    const safetyFundAfterDraw = await balanceOf(admin, "group_safety_fund", null, groupId);
    const custodyAfterDraw = await balanceOf(admin, "group_custody", null, groupId);
    assert(safetyFundAfterDraw === 500, `safety fund drew down to 500 (1500 - 1000 fine) (got ${safetyFundAfterDraw})`);
    assert(custodyAfterDraw === 21000, `group_custody absorbed the 1000 draw (20000 + 1000) (got ${custodyAfterDraw})`);

    console.log("--- confirm_late_payment credits the safety fund from an external payment ---");
    await admin.from("contributions").update({ status: "missed" }).eq("id", memberContribution.id).eq("status", "missed");
    const lateSubmitRes = await rpc("submit_late_payment_proof", member.accessToken, {
      p_contribution_id: memberContribution.id, p_transaction_id: "TEST-LATE-TXN", p_screenshot_path: "test/late.png",
    });
    assert(lateSubmitRes.status < 300, "member submitted late-payment proof");

    const lateConfirmRes = await rpc("confirm_late_payment", groupAdmin.accessToken, {
      p_contribution_id: memberContribution.id, p_approve: true, p_reason: null,
    });
    assert(lateConfirmRes.status < 300, `confirm_late_payment succeeded (status ${lateConfirmRes.status})`);

    const safetyFundAfterLate = await balanceOf(admin, "group_safety_fund", null, groupId);
    assert(safetyFundAfterLate === 500 + 21500 + 1000, `safety fund credited owed(21500) + fine(1000) on top of the 500 remaining (got ${safetyFundAfterLate})`);

    console.log("--- wallet_transactions trigger: topup, withdrawal reserve/release, payout credit ---");
    const { data: topupRow } = await admin.from("wallet_transactions").insert({
      user_id: member.userId, type: "topup", amount: 5000, status: "pending", phone: "+250788000666",
    }).select("id").single();
    let bal = await balanceOf(admin, "user_wallet", member.userId, null);
    assert(bal === 0, "a pending topup does not yet post anything (matches get_wallet_balance's own formula)");
    await admin.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", topupRow.id);
    bal = await balanceOf(admin, "user_wallet", member.userId, null);
    assert(bal === 5000, `topup completion posted 5000 to the wallet (got ${bal})`);

    const { data: withdrawRow } = await admin.from("wallet_transactions").insert({
      user_id: member.userId, type: "withdrawal", amount: 2000, status: "pending", phone: "+250788000666",
    }).select("id").single();
    bal = await balanceOf(admin, "user_wallet", member.userId, null);
    assert(bal === 3000, `withdrawal reservation immediately posted -2000 (got ${bal}, expected 3000)`);
    await admin.from("wallet_transactions").update({ status: "failed", failure_reason: "test" }).eq("id", withdrawRow.id);
    bal = await balanceOf(admin, "user_wallet", member.userId, null);
    assert(bal === 5000, `failed withdrawal released the reservation back (got ${bal})`);

    await admin.from("wallet_transactions").insert({
      user_id: member.userId, type: "payout_credit", amount: 7000, status: "completed",
      phone: "+250788000666", source_group_id: groupId, completed_at: new Date().toISOString(),
    });
    bal = await balanceOf(admin, "user_wallet", member.userId, null);
    assert(bal === 12000, `payout_credit posted +7000 from group custody into the wallet (got ${bal})`);
    const custodyAfterPayoutCredit = await balanceOf(admin, "group_custody", null, groupId);
    assert(custodyAfterPayoutCredit === 21000 - 7000, `group_custody debited by the same 7000 (got ${custodyAfterPayoutCredit})`);

    console.log("--- get_shadow_ledger_integrity_report() ---");
    const rejectedRes = await rpc("get_shadow_ledger_integrity_report", member.accessToken);
    assert(rejectedRes.status >= 400, "non-staff user is rejected");
    const okRes = await rpc("get_shadow_ledger_integrity_report", staffer.accessToken);
    assert(okRes.status < 300, `staff user succeeds (status ${okRes.status})`);
    const report = (await okRes.json())[0];
    console.log("  report:", report);
    assert(Number(report.unbalanced_postings) === 0, "no unbalanced postings exist");
    assert(Number(report.balance_projection_drift_accounts) === 0, "account_balances projection matches the posting history exactly");
    assert(Number(report.global_debit_total) === Number(report.global_credit_total), "global debits equal global credits across every posting");
    // Compared against the pre-run baseline, not absolute zero: rows
    // created by earlier project phases (before this migration existed)
    // will always show as "missing a posting" — a real, disclosed gap
    // for Stage B to backfill later. What matters here is that this
    // run's own new custody/wallet events didn't add to that gap.
    assert(
      Number(report.custody_ledger_rows_missing_posting) === Number(baseline.custody_ledger_rows_missing_posting),
      `no new custody_ledger coverage gaps introduced (baseline ${baseline.custody_ledger_rows_missing_posting}, now ${report.custody_ledger_rows_missing_posting})`,
    );
    assert(
      Number(report.wallet_topup_completed_missing_posting) === Number(baseline.wallet_topup_completed_missing_posting),
      `no new wallet topup coverage gaps introduced (baseline ${baseline.wallet_topup_completed_missing_posting}, now ${report.wallet_topup_completed_missing_posting})`,
    );
    assert(
      Number(report.wallet_payout_credit_missing_posting) === Number(baseline.wallet_payout_credit_missing_posting),
      `no new payout_credit coverage gaps introduced (baseline ${baseline.wallet_payout_credit_missing_posting}, now ${report.wallet_payout_credit_missing_posting})`,
    );
    assert(
      Number(report.wallet_withdrawal_missing_posting) === Number(baseline.wallet_withdrawal_missing_posting),
      `no new withdrawal coverage gaps introduced (baseline ${baseline.wallet_withdrawal_missing_posting}, now ${report.wallet_withdrawal_missing_posting})`,
    );
    assert(Number(report.posting_failure_count) === 0, "no posting failures were logged during this run");

    console.log("\nAll shadow-ledger checks passed.");
  } finally {
    console.log("--- Cleanup ---");
    if (groupId) {
      await admin.from("payout_requests").delete().eq("group_id", groupId);
      await admin.from("custody_ledger").delete().eq("group_id", groupId);
      await admin.from("contributions").delete().eq("group_id", groupId);
      await admin.from("cycles").delete().eq("group_id", groupId);
      await admin.from("group_members").delete().eq("group_id", groupId);
      await admin.from("groups").delete().eq("id", groupId);
    }
    await admin.from("wallet_transactions").delete().in("user_id", [member.userId]);
    await admin.from("staff_users").delete().eq("user_id", staffer.userId);
    await admin.auth.admin.deleteUser(groupAdmin.userId);
    await admin.auth.admin.deleteUser(member.userId);
    await admin.auth.admin.deleteUser(staffer.userId);
    console.log("  done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
