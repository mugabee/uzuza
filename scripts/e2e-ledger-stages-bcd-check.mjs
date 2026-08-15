// Final verification for Stages B, C, and D of the double-entry ledger
// redesign against the real deployed backend. Covers:
//   - Stage B: backfill idempotency (already-applied backfill produces
//     zero new rows on re-run), and the live reservation-conversion
//     subsidy trigger.
//   - Stage C: get_wallet_balance()/get_total_uzuza_held()/
//     get_custody_overview() now read from the ledger, including
//     proving the exact divergence-then-fix the cutover was for (a
//     late-payment safety-fund credit that the OLD formula silently
//     never counted).
//   - Stage D: groups.safety_fund_balance freezes for a uzuza_held
//     group (the ledger becomes sole authority) while it keeps updating
//     normally, unchanged, for a group_owned group.
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
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function main() {
  const admin = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login test users ---");
  const uzuzaAdmin = await loginAs("+250788000811");
  const uzuzaMember = await loginAs("+250788000812");
  const ownedAdmin = await loginAs("+250788000813");
  const ownedMember = await loginAs("+250788000814");
  const staffer = await loginAs("+250788000815");
  await admin.from("staff_users").insert({ user_id: staffer.userId });

  let uzuzaGroupId, ownedGroupId, resGroupId;
  try {
    console.log("--- Stage B: backfill re-run is a no-op (idempotent) ---");
    const rerun = await admin.rpc("run_stage_b_backfill");
    const totalPosted = (rerun.data ?? []).reduce((s, r) => s + Number(r.rows_posted), 0);
    assert(totalPosted === 0, `re-running the backfill posts nothing new (${JSON.stringify(rerun.data)})`);

    console.log("--- Stage C: get_wallet_balance() reads from the ledger ---");
    const preBalRes = await rpc("get_wallet_balance", uzuzaMember.accessToken);
    assert(Number(await preBalRes.json()) === 0, "a fresh user's wallet balance is 0");
    const { data: topupRow } = await admin.from("wallet_transactions").insert({
      user_id: uzuzaMember.userId, type: "topup", amount: 4200, status: "pending",
      phone: "+250788000812",
    }).select("id").single();
    await admin.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", topupRow.id);
    const postBalRes = await rpc("get_wallet_balance", uzuzaMember.accessToken);
    assert(Number(await postBalRes.json()) === 4200, "get_wallet_balance() reflects the ledger-posted topup");

    console.log("--- Build a uzuza_held + buffer group to exercise Stage C/D together ---");
    const createRes = await rpc("create_group", uzuzaAdmin.accessToken, {
      p_name: "Stages BCD E2E uzuza_held", p_group_type: "rotating", p_contribution_amount: 30000,
      p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
      p_rotation_method: "random", p_approval_threshold: "1",
    });
    uzuzaGroupId = await createRes.json();
    await rpc("join_group", uzuzaMember.accessToken, { p_group_id: uzuzaGroupId });
    await admin.from("groups").update({ account_type: "uzuza_held" }).eq("id", uzuzaGroupId);
    await rpc("set_safety_fund_type", uzuzaAdmin.accessToken, { p_group_id: uzuzaGroupId, p_safety_fund_type: "buffer" });
    await rpc("start_cycle", uzuzaAdmin.accessToken, { p_group_id: uzuzaGroupId });

    const { data: contribs } = await admin.from("contributions").select("id, member_id, amount").eq("group_id", uzuzaGroupId);
    const adminContrib = contribs.find((c) => c.member_id === uzuzaAdmin.userId);
    const memberContrib = contribs.find((c) => c.member_id === uzuzaMember.userId);

    const totalBefore = Number(await (await rpc("get_total_uzuza_held", staffer.accessToken)).json());

    const ref = `STAGES-BCD-${Date.now()}`;
    await admin.from("contributions").update({ payment_channel: "momo_collections", collection_reference_id: ref, status: "submitted" }).eq("id", adminContrib.id);
    const confirmRes = await admin.rpc("momo_confirm_contribution", { p_contribution_id: adminContrib.id, p_reference_id: ref });
    assert(!confirmRes.error, `contribution confirmed (${confirmRes.error?.message ?? ""})`);

    console.log("--- Stage D: safety_fund_balance column FREEZES for uzuza_held after the skim ---");
    const { data: groupAfterSkim } = await admin.from("groups").select("safety_fund_balance").eq("id", uzuzaGroupId).single();
    assert(Number(groupAfterSkim.safety_fund_balance) === 0, "the legacy column stays at 0 — no longer directly written for a uzuza_held group");
    const ledgerFundBalRes = await rpc("get_group_safety_fund_balance", uzuzaAdmin.accessToken, { p_group_id: uzuzaGroupId });
    assert(Number(await ledgerFundBalRes.json()) === 30000 * 0.075, "get_group_safety_fund_balance() correctly returns the ledger-derived 2250, even though the column is frozen at 0");

    console.log("--- report_missed_payment reads the ledger-derived balance, not the frozen column ---");
    const { data: cycleRow } = await admin.from("cycles").select("id").eq("group_id", uzuzaGroupId).single();
    await admin.from("payout_requests").insert({
      cycle_id: cycleRow.id, group_id: uzuzaGroupId, recipient_user_id: uzuzaMember.userId, amount: 30000,
      status: "completed", requested_by: uzuzaAdmin.userId, transaction_id: "FAKE-TEST-PAYOUT", completed_at: new Date().toISOString(),
    });
    const missedRes = await rpc("report_missed_payment", uzuzaAdmin.accessToken, { p_contribution_id: memberContrib.id, p_fine_amount: 1000 });
    assert(missedRes.status < 300, `report_missed_payment succeeded even though the column read would have wrongly seen 0 (status ${missedRes.status})`);
    const ledgerFundAfterDrawRes = await rpc("get_group_safety_fund_balance", uzuzaAdmin.accessToken, { p_group_id: uzuzaGroupId });
    assert(Number(await ledgerFundAfterDrawRes.json()) === 2250 - 1000, "fund balance correctly drew down via the ledger (1250 remaining)");

    console.log("--- confirm_late_payment: the exact case the OLD get_total_uzuza_held() formula silently missed ---");
    await rpc("submit_late_payment_proof", uzuzaMember.accessToken, {
      p_contribution_id: memberContrib.id, p_transaction_id: "TEST-LATE", p_screenshot_path: "test/late.png",
    });
    const lateRes = await rpc("confirm_late_payment", uzuzaAdmin.accessToken, { p_contribution_id: memberContrib.id, p_approve: true, p_reason: null });
    assert(lateRes.status < 300, "confirm_late_payment succeeded");

    const totalAfter = Number(await (await rpc("get_total_uzuza_held", staffer.accessToken)).json());
    const lateCreditAmount = Number(memberContrib.amount) + 1000; // owed + fine
    const custodyInflowAmount = Number(adminContrib.amount);
    const expectedIncrease = custodyInflowAmount + lateCreditAmount; // net effect: contribution custody-in + late credit (skim/draw are internal transfers, net zero)
    assert(
      totalAfter - totalBefore === expectedIncrease,
      `get_total_uzuza_held() increased by exactly ${expectedIncrease} (custody inflow ${custodyInflowAmount} + late-payment credit ${lateCreditAmount}), got ${totalAfter - totalBefore}`,
    );

    // Prove this is a REAL fix, not just a passing assertion: recompute
    // what the OLD (legacy) formula would have returned right now — it
    // never looked at safety_fund_balance at all, so it silently misses
    // the late-payment credit entirely.
    const { data: custodyRows } = await admin.from("custody_ledger").select("amount").is("swept_at", null);
    const { data: topupRows } = await admin.from("wallet_transactions").select("amount").eq("type", "topup").eq("status", "completed");
    const { data: creditRows } = await admin.from("wallet_transactions").select("amount").eq("type", "payout_credit").eq("status", "completed");
    const { data: withdrawalRows } = await admin.from("wallet_transactions").select("amount").eq("type", "withdrawal").in("status", ["completed", "pending"]);
    const sum = (arr) => (arr ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const legacyTotal = sum(custodyRows) + sum(topupRows) + sum(creditRows) - sum(withdrawalRows);
    assert(
      totalAfter - legacyTotal === lateCreditAmount,
      `confirmed real bug fix: the OLD formula (${legacyTotal}) under-counts the NEW one (${totalAfter}) by exactly the late-payment credit (${lateCreditAmount}) it never tracked`,
    );

    console.log("--- get_custody_overview() now agrees with get_total_uzuza_held() ---");
    const overviewRes = await rpc("get_custody_overview", staffer.accessToken);
    const overview = (await overviewRes.json())[0];
    assert(Number(overview.held_total) === totalAfter, `staff dashboard held_total (${overview.held_total}) now exactly matches the cap-enforcement total (${totalAfter}) — the Stage A inconsistency is fixed`);

    console.log("--- Control group: a group_owned group's safety_fund_balance keeps updating normally, unchanged ---");
    const createOwnedRes = await rpc("create_group", ownedAdmin.accessToken, {
      p_name: "Stages BCD E2E group_owned", p_group_type: "rotating", p_contribution_amount: 20000,
      p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
      p_rotation_method: "random", p_approval_threshold: "1",
    });
    ownedGroupId = await createOwnedRes.json();
    await rpc("join_group", ownedMember.accessToken, { p_group_id: ownedGroupId });
    await rpc("set_safety_fund_type", ownedAdmin.accessToken, { p_group_id: ownedGroupId, p_safety_fund_type: "buffer" });
    await rpc("start_cycle", ownedAdmin.accessToken, { p_group_id: ownedGroupId });
    const { data: ownedContribs } = await admin.from("contributions").select("id, member_id").eq("group_id", ownedGroupId);
    const ownedAdminContrib = ownedContribs.find((c) => c.member_id === ownedAdmin.userId);
    await admin.from("contributions").update({ status: "submitted" }).eq("id", ownedAdminContrib.id);
    const ownedConfirmRes = await rpc("confirm_contribution", ownedAdmin.accessToken, { p_contribution_id: ownedAdminContrib.id, p_approve: true, p_reason: null });
    assert(ownedConfirmRes.status < 300, `group_owned confirm_contribution succeeded (status ${ownedConfirmRes.status}, no MFA gate since account_type stays group_owned)`);
    const { data: ownedGroupAfter } = await admin.from("groups").select("safety_fund_balance").eq("id", ownedGroupId).single();
    assert(Number(ownedGroupAfter.safety_fund_balance) === 20000 * 0.075, "group_owned safety_fund_balance still updates directly, exactly as before Stage D — untouched legacy path");
    const ownedLedgerCheck = await admin
      .from("ledger_accounts")
      .select("id")
      .eq("account_type", "group_safety_fund")
      .eq("owner_group_id", ownedGroupId)
      .maybeSingle();
    assert(!ownedLedgerCheck.data, "no shadow-ledger account was ever created for the group_owned group's safety fund — correctly out of scope");

    console.log("--- Reservation-conversion subsidy trigger (direct exercise, matching start_cycle's exact insert shape) ---");
    const createResRes = await rpc("create_group", uzuzaAdmin.accessToken, {
      p_name: "Stages BCD E2E reservation-conversion", p_group_type: "rotating", p_contribution_amount: 40000,
      p_frequency: "monthly", p_target_size: 5, p_account_type: "group_owned",
      p_rotation_method: "random", p_approval_threshold: "1",
    });
    resGroupId = await createResRes.json();
    const { data: resRow } = await admin.from("reservations").insert({
      group_id: resGroupId, user_id: uzuzaMember.userId, fee_amount: 2000, status: "confirmed",
      unique_reference: `TEST-RES-${Date.now()}`, confirmed_at: new Date().toISOString(),
    }).select("id").single();
    await admin.from("custody_ledger").insert({ group_id: resGroupId, reservation_id: resRow.id, amount: 2000 });
    const { data: cycleForRes } = await admin.from("cycles").insert({
      group_id: resGroupId, cycle_number: 1, recipient_user_id: uzuzaMember.userId,
    }).select("id").single();
    const { data: resContribRow } = await admin.from("contributions").insert({
      cycle_id: cycleForRes.id, group_id: resGroupId, member_id: uzuzaMember.userId,
      unique_reference: `TEST-RESCONV-${Date.now()}`, amount: 40000, status: "confirmed",
      reservation_id: resRow.id, confirmed_at: new Date().toISOString(),
    }).select("id").single();

    const subsidyPosting = await admin.from("ledger_postings").select("id, source_event").eq("source_table", "contributions").eq("source_id", resContribRow.id).maybeSingle();
    assert(subsidyPosting.data?.source_event === "reservation_conversion_subsidy", "the live trigger posted a reservation_conversion_subsidy entry automatically");
    const custodyForResGroup = await admin.from("ledger_accounts").select("id").eq("account_type", "group_custody").eq("owner_group_id", resGroupId).single();
    const { data: custodyBalRow } = await admin.from("ledger_account_balances").select("balance").eq("account_id", custodyForResGroup.data.id).single();
    assert(Number(custodyBalRow.balance) === 40000, "group_custody now shows the FULL 40000 (2000 real fee + 38000 subsidized shortfall), matching what the contribution record claims");

    console.log("--- Final integrity reports ---");
    const shadowReportRes = await rpc("get_shadow_ledger_integrity_report", staffer.accessToken);
    const shadowReport = (await shadowReportRes.json())[0];
    console.log("  shadow ledger report:", shadowReport);
    assert(Number(shadowReport.unbalanced_postings) === 0, "zero unbalanced postings platform-wide");
    assert(Number(shadowReport.balance_projection_drift_accounts) === 0, "zero balance projection drift platform-wide");
    assert(Number(shadowReport.global_debit_total) === Number(shadowReport.global_credit_total), "global debits equal global credits platform-wide");
    assert(Number(shadowReport.posting_failure_count) === 0, "zero posting failures logged during this entire run");

    const ledgerReportRes = await rpc("get_ledger_integrity_report", staffer.accessToken);
    const ledgerReport = (await ledgerReportRes.json())[0];
    console.log("  Stage-3 ledger_events integrity report:", ledgerReport);
    assert(Number(ledgerReport.negative_balance_user_count) === 0, "no negative wallet balances platform-wide");

    console.log("\nAll Stage B/C/D checks passed.");
  } finally {
    console.log("--- Cleanup ---");
    for (const gid of [uzuzaGroupId, ownedGroupId, resGroupId].filter(Boolean)) {
      await admin.from("payout_requests").delete().eq("group_id", gid);
      await admin.from("custody_ledger").delete().eq("group_id", gid);
      await admin.from("contributions").delete().eq("group_id", gid);
      await admin.from("cycles").delete().eq("group_id", gid);
      await admin.from("reservations").delete().eq("group_id", gid);
      await admin.from("group_members").delete().eq("group_id", gid);
      await admin.from("groups").delete().eq("id", gid);
    }
    await admin.from("wallet_transactions").delete().in("user_id", [uzuzaMember.userId]);
    await admin.from("staff_users").delete().eq("user_id", staffer.userId);
    for (const u of [uzuzaAdmin, uzuzaMember, ownedAdmin, ownedMember, staffer]) {
      await admin.auth.admin.deleteUser(u.userId);
    }
    // The ledger correctly NEVER forgets financial history on its own
    // (no cascade from custody_ledger/contributions/wallet_transactions
    // deletes to ledger_postings — by design, since a real group is
    // never hard-deleted in production). That means this script's own
    // domain-row deletes above leave orphaned ledger_accounts behind
    // every run. Purge them so repeated runs don't accumulate residue
    // that skews exact-total comparisons.
    const purged = await admin.rpc("purge_orphaned_ledger_test_accounts");
    console.log(`  purged ${purged.data ?? 0} orphaned test ledger accounts.`);
    console.log("  done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
