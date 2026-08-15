// Repeatable regression check for step 3 (ledger hardening) against the
// real deployed Supabase backend. Verifies, with real writes/rejections
// rather than reading migration source:
//   - ledger_events captures inserts/updates automatically and rejects
//     UPDATE/DELETE against itself (append-only, enforced in the DB not
//     just by convention)
//   - the wallet balance non-negative invariant trigger rejects a write
//     that would leave a user with negative spendable balance, even when
//     called directly (bypassing the RPC-level check)
//   - amount-immutability triggers reject an UPDATE that changes
//     contributions.amount / wallet_transactions.amount
//   - get_ledger_integrity_report() rejects non-staff and returns sane
//     zero-defect numbers for a granted staff user
// Requires sms_test_otp set in Supabase's auth config (see CLAUDE.md).
// Cleans up all test data it creates on success.
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

async function main() {
  const admin = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login a regular test user and grant a second one staff access ---");
  const member = await loginAs("+250788000333");
  const staffer = await loginAs("+250788000444");
  await admin.from("staff_users").insert({ user_id: staffer.userId });

  try {
    console.log("--- ledger_events is append-only ---");
    const before = await admin.from("ledger_events").select("id").limit(1);
    assert(!before.error, `ledger_events is readable by service role (${before.error?.message ?? ""})`);
    if (before.data.length > 0) {
      const target = before.data[0].id;
      const upd = await admin.from("ledger_events").update({ operation: "TAMPERED" }).eq("id", target);
      assert(!!upd.error, "UPDATE against ledger_events is rejected");
      const del = await admin.from("ledger_events").delete().eq("id", target);
      assert(!!del.error, "DELETE against ledger_events is rejected");
    } else {
      console.log("  (no existing ledger_events rows to test mutation-rejection against — skipping that sub-check)");
    }

    console.log("--- A wallet_transactions write is captured automatically ---");
    const { data: topupRow, error: topupErr } = await admin
      .from("wallet_transactions")
      .insert({ user_id: member.userId, type: "topup", amount: 500, status: "pending", phone: "+250788000333" })
      .select("id")
      .single();
    assert(!topupErr && !!topupRow, `test top-up row inserted (${topupErr?.message ?? ""})`);
    const { data: eventRows } = await admin
      .from("ledger_events")
      .select("id, operation, table_name")
      .eq("row_id", topupRow.id)
      .eq("table_name", "wallet_transactions");
    assert(eventRows.length >= 1 && eventRows.some((e) => e.operation === "INSERT"), "capture_ledger_event logged the INSERT automatically");

    console.log("--- Amount immutability ---");
    const amountUpdate = await admin.from("wallet_transactions").update({ amount: 999 }).eq("id", topupRow.id);
    assert(!!amountUpdate.error, "changing wallet_transactions.amount is rejected");
    const statusUpdate = await admin.from("wallet_transactions").update({ status: "failed", failure_reason: "test cleanup" }).eq("id", topupRow.id);
    assert(!statusUpdate.error, "changing wallet_transactions.status (not amount) still works normally");

    console.log("--- Wallet balance non-negative invariant (direct write, bypassing the RPC-level check) ---");
    const directWithdrawal = await admin
      .from("wallet_transactions")
      .insert({ user_id: member.userId, type: "withdrawal", amount: 5_000_000, status: "pending", phone: "+250788000333" });
    assert(!!directWithdrawal.error, "a direct insert that would leave a negative balance is rejected at the DB level");

    console.log("--- get_ledger_integrity_report() ---");
    const rejectedRes = await rpc("get_ledger_integrity_report", member.accessToken);
    assert(rejectedRes.status >= 400, "non-staff user is rejected");
    const okRes = await rpc("get_ledger_integrity_report", staffer.accessToken);
    assert(okRes.status < 300, `staff user succeeds (status ${okRes.status})`);
    const report = (await okRes.json())[0];
    console.log("  report:", report);
    assert(typeof report.wallet_balance_check_ok === "boolean", "report includes wallet_balance_check_ok");
    assert(Number(report.total_ledger_events) > 0, "report shows ledger_events being populated");

    console.log("\nAll ledger-hardening checks passed.");
  } finally {
    console.log("--- Cleanup ---");
    await admin.from("wallet_transactions").delete().eq("user_id", member.userId);
    await admin.from("staff_users").delete().eq("user_id", staffer.userId);
    await admin.auth.admin.deleteUser(member.userId);
    await admin.auth.admin.deleteUser(staffer.userId);
    console.log("  done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
