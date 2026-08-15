// Verifies the fraud/velocity flagging and ledger-drift monitoring
// added after the LibreFinTech-standards gap comparison. Confirms:
//   - a large top-up gets flagged (large_transaction) without being
//     blocked
//   - repeated withdrawals crossing the velocity limit get flagged
//     (high_velocity) without being blocked
//   - flags never affect the actual RPC's success/return value
//   - staff-only list/resolve RPCs work, non-staff is rejected
//   - run_ledger_drift_check() is callable by service_role (the cron
//     path) and correctly finds nothing wrong on a healthy ledger
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
  const member = await loginAs("+250788000921");
  const staffer = await loginAs("+250788000922");
  await admin.from("staff_users").insert({ user_id: staffer.userId });
  await admin.from("wallet_consents").insert({ user_id: member.userId });

  try {
    console.log("--- Baseline thresholds ---");
    const { data: settings } = await admin.from("platform_settings").select("large_transaction_threshold, velocity_window_hours, velocity_limit_amount").eq("id", 1).single();
    console.log("  thresholds:", settings);
    assert(Number(settings.large_transaction_threshold) > 0, "large_transaction_threshold is configured");
    assert(Number(settings.velocity_limit_amount) > 0, "velocity_limit_amount is configured");

    console.log("--- A large top-up gets flagged, without being blocked ---");
    const largeAmount = Number(settings.large_transaction_threshold) + 1;
    const ref1 = `FRAUD-TEST-${Date.now()}-1`;
    const topupRes = await rpc("initiate_wallet_topup", member.accessToken, { p_amount: largeAmount, p_phone: "+250788000921", p_reference_id: ref1 });
    assert(topupRes.status < 300, `large top-up RPC succeeded, not blocked (status ${topupRes.status})`);
    const topup = (await topupRes.json());
    const topupTxId = topup.id ?? topup[0]?.id;

    const { data: largeFlags } = await admin.from("fraud_flags").select("*").eq("entity_id", topupTxId).eq("flag_type", "large_transaction");
    assert(largeFlags.length === 1, "exactly one large_transaction flag recorded for the oversized top-up");

    console.log("--- Repeated withdrawals crossing the velocity limit get flagged ---");
    // request_wallet_withdrawal itself requires a verified TOTP/aal2
    // session (Phase 10 MFA gating), which this Supabase project's
    // broken TOTP enrollment makes impossible to exercise from any test
    // script (same known blocker as confirm_contribution on a
    // uzuza_held group). check_wallet_velocity_and_threshold is the
    // exact function both wallet RPCs call internally — exercising it
    // directly (service role, matching how a real inserted-then-checked
    // withdrawal row looks) tests the identical logic without the
    // unrelated MFA blocker.
    const half = Math.floor(Number(settings.velocity_limit_amount) / 2) + 1000;

    // Fund the wallet first — the balance-non-negative invariant
    // trigger (Stage 3 hardening) would otherwise reject the
    // withdrawal rows below outright. Insert as 'pending' then update
    // to 'completed' — the wallet_transactions posting trigger only
    // fires the topup-completed posting on that UPDATE transition, not
    // on a direct completed-at-insert (matches how a real topup is
    // always created, and how initiate_wallet_topup/
    // momo_confirm_wallet_topup actually behave).
    const { data: seedTopup } = await admin.from("wallet_transactions").insert({
      user_id: member.userId, type: "topup", amount: half * 2 + 10000, status: "pending",
      phone: "+250788000921",
    }).select("id").single();
    await admin.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", seedTopup.id);

    const { data: w1Row } = await admin.from("wallet_transactions").insert({
      user_id: member.userId, type: "withdrawal", amount: half, status: "completed",
      phone: "+250788000921", completed_at: new Date().toISOString(),
    }).select("id").single();
    await admin.rpc("check_wallet_velocity_and_threshold", {
      p_user_id: member.userId, p_type: "withdrawal", p_amount: half, p_new_transaction_id: w1Row.id,
    });
    const { data: velocityFlagsAfterFirst } = await admin.from("fraud_flags").select("id").eq("user_id", member.userId).eq("flag_type", "high_velocity");
    assert(velocityFlagsAfterFirst.length === 0, "no velocity flag yet after just the first withdrawal (under the limit)");

    const { data: w2Row } = await admin.from("wallet_transactions").insert({
      user_id: member.userId, type: "withdrawal", amount: half, status: "completed",
      phone: "+250788000921", completed_at: new Date().toISOString(),
    }).select("id").single();
    const { error: secondCheckError } = await admin.rpc("check_wallet_velocity_and_threshold", {
      p_user_id: member.userId, p_type: "withdrawal", p_amount: half, p_new_transaction_id: w2Row.id,
    });
    assert(!secondCheckError, `the velocity check itself never raises/blocks (${secondCheckError?.message ?? "no error"})`);

    const { data: velocityFlagsAfterSecond } = await admin.from("fraud_flags").select("id, amount, details").eq("user_id", member.userId).eq("flag_type", "high_velocity");
    assert(velocityFlagsAfterSecond.length === 1, `exactly one high_velocity flag after crossing the cumulative limit (got ${velocityFlagsAfterSecond.length})`);

    console.log("--- Staff-only access on the review RPCs ---");
    const rejectedList = await rpc("list_fraud_flags", member.accessToken, { p_unresolved_only: false });
    assert(rejectedList.status >= 400, "non-staff user is rejected by list_fraud_flags");
    const okList = await rpc("list_fraud_flags", staffer.accessToken, { p_unresolved_only: true });
    assert(okList.status < 300, `staff user succeeds (status ${okList.status})`);
    const listed = await okList.json();
    assert(listed.some((f) => f.id === largeFlags[0].id), "the large-transaction flag is visible to staff via list_fraud_flags");

    const resolveRes = await rpc("resolve_fraud_flag", staffer.accessToken, { p_id: largeFlags[0].id, p_note: "confirmed legitimate top-up, false positive" });
    assert(resolveRes.status < 300, "staff can resolve a flag");
    const { data: afterResolve } = await admin.from("fraud_flags").select("resolved_at, resolved_by").eq("id", largeFlags[0].id).single();
    assert(afterResolve.resolved_at !== null && afterResolve.resolved_by === staffer.userId, "resolution recorded correctly");

    console.log("--- run_ledger_drift_check() ---");
    const rejectedDrift = await rpc("run_ledger_drift_check", member.accessToken);
    assert(rejectedDrift.status >= 400, "a non-staff, non-service-role caller is rejected");
    const { data: driftResult, error: driftError } = await admin.rpc("run_ledger_drift_check").single();
    assert(!driftError, `service_role (cron path) can call it directly (${driftError?.message ?? ""})`);
    console.log("  drift result:", driftResult);
    assert(driftResult.drift_found === false, "a healthy ledger correctly reports no drift");
    assert(Number(driftResult.unbalanced_postings) === 0, "zero unbalanced postings");

    console.log("\nAll fraud/velocity checks passed.");
  } finally {
    console.log("--- Cleanup ---");
    await admin.from("fraud_flags").delete().or(`user_id.eq.${member.userId}`);
    await admin.from("wallet_transactions").delete().eq("user_id", member.userId);
    await admin.from("wallet_consents").delete().eq("user_id", member.userId);
    await admin.from("staff_users").delete().eq("user_id", staffer.userId);
    await admin.auth.admin.deleteUser(member.userId);
    await admin.auth.admin.deleteUser(staffer.userId);
    // Purge AFTER the deletes above — the user must already be gone
    // (owner_user_id nulled via ON DELETE SET NULL) for the orphan
    // criteria to actually match; purging first finds nothing.
    const purge = await admin.rpc("purge_orphaned_ledger_test_accounts");
    console.log(`  purged ${purge.data ?? 0} orphaned test ledger accounts.`);
    console.log("  done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
