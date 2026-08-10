// Regression check for the second international-payments batch: late
// payments can be submitted with an international channel/currency, and
// the two custody reporting views (per-group reconciliation, platform
// staff monitor) surface payer currency alongside RWF.
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

async function rpc(fn, token, body) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log("  ok:", msg);
}

async function main() {
  console.log("--- Login two users ---");
  const admin = await loginAs("+250788006111");
  const joiner = await loginAs("+250788006222");
  console.log("admin:", admin.userId, "joiner:", joiner.userId);

  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function uploadProof(bucket, ownerToken, prefix) {
    const client = createClient(BASE, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ownerToken}` } },
    });
    const path = `${prefix}/${Date.now()}.png`;
    const { error } = await client.storage.from(bucket).upload(path, TINY_PNG, {
      contentType: "image/png",
    });
    if (error) throw new Error(`upload to ${bucket} failed: ${error.message}`);
    return path;
  }

  console.log("\n=== 1. Late payment: international_manual (USD) ===");
  const groupRes = await rpc("create_group", admin.accessToken, {
    p_name: "Late Payment Intl Test Group",
    p_group_type: "rotating",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 2,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
  });
  assert(groupRes.status < 300, "group created");
  const groupId = groupRes.data;

  await rpc("join_group", joiner.accessToken, { p_group_id: groupId });
  const startRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
  assert(startRes.status < 300, "cycle started");

  const { data: contributions } = await adminClient
    .from("contributions")
    .select("id, member_id")
    .eq("cycle_id", startRes.data);
  const joinerContribution = contributions.find((c) => c.member_id === joiner.userId);

  const missedRes = await rpc("report_missed_payment", admin.accessToken, {
    p_contribution_id: joinerContribution.id,
    p_fine_amount: 2500,
  });
  assert(missedRes.status < 300, "missed payment reported with a fine");

  const proofPath = await uploadProof("contribution-proofs", joiner.accessToken, joinerContribution.id);
  const lateProofRes = await rpc("submit_late_payment_proof", joiner.accessToken, {
    p_contribution_id: joinerContribution.id,
    p_transaction_id: "WISE-LATE-TEST-001",
    p_screenshot_path: proofPath,
    p_payment_channel: "international_manual",
    p_payer_currency: "usd",
    p_payer_amount: 44,
    p_fx_rate_to_rwf: 625,
  });
  assert(lateProofRes.status < 300, "international late payment proof submitted");

  const { data: lateRow } = await adminClient
    .from("contributions")
    .select("status, payment_channel, payer_currency, payer_amount")
    .eq("id", joinerContribution.id)
    .single();
  assert(lateRow.status === "late_submitted", "status advanced to late_submitted");
  assert(lateRow.payment_channel === "international_manual", "late payment channel stored");
  assert(lateRow.payer_currency === "USD", "late payment currency stored");

  const confirmLateRes = await rpc("confirm_late_payment", admin.accessToken, {
    p_contribution_id: joinerContribution.id,
    p_approve: true,
    p_reason: null,
  });
  assert(confirmLateRes.status < 300, "admin confirmed the late payment");

  console.log("\n=== 2. Custody reconciliation: per-group view shows currency ===");
  const matchingGroupRes = await rpc("create_group", admin.accessToken, {
    p_name: "Custody Reporting Intl Test Group",
    p_group_type: "rotating",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 2,
    p_account_type: "uzuza_held",
    p_rotation_method: "random",
    p_approval_threshold: "1",
    p_is_matching_group: true,
  });
  assert(matchingGroupRes.status < 300, "matching group created");
  const matchingGroupId = matchingGroupRes.data;

  const reserveRes = await rpc("reserve_spot", joiner.accessToken, { p_group_id: matchingGroupId });
  assert(reserveRes.status < 300, "reservation created");
  const reservationId = reserveRes.data;

  const reservationProofPath = await uploadProof("reservation-proofs", joiner.accessToken, reservationId);
  await rpc("submit_reservation_proof", joiner.accessToken, {
    p_reservation_id: reservationId,
    p_transaction_id: "MTN-REM-CUSTODY-TEST-001",
    p_screenshot_path: reservationProofPath,
    p_payment_channel: "momo_remittance",
    p_payer_currency: "gbp",
    p_payer_amount: 18,
    p_fx_rate_to_rwf: 1666.67,
  });

  const confirmReservationRes = await rpc("confirm_reservation", admin.accessToken, {
    p_reservation_id: reservationId,
  });
  assert(confirmReservationRes.status < 300, "admin confirmed the reservation (custody entry created)");

  const reconciliationRes = await rpc("get_custody_reconciliation", admin.accessToken, {
    p_group_id: matchingGroupId,
  });
  assert(reconciliationRes.status < 300, "reconciliation RPC succeeded");
  const entry = reconciliationRes.data.find((r) => r.source === "reservation");
  assert(!!entry, "reservation entry present in reconciliation");
  assert(entry.payment_channel === "momo_remittance", "reconciliation entry shows payment channel");
  assert(entry.payer_currency === "GBP", "reconciliation entry shows payer currency");
  assert(Number(entry.payer_amount) === 18, "reconciliation entry shows payer amount");
  assert(!entry.swept_at, "entry is still held (not yet swept)");

  console.log("\n=== 3. Custody overview: staff monitor shows international count ===");
  await adminClient.from("staff_users").insert({ user_id: admin.userId });

  const overviewRes = await rpc("get_custody_overview", admin.accessToken, {});
  assert(overviewRes.status < 300, "staff can call get_custody_overview");
  const overview = overviewRes.data[0];
  assert(overview.international_held_count >= 1, "international_held_count reflects the new entry");

  console.log("--- non-staff is rejected ---");
  const nonStaffOverview = await rpc("get_custody_overview", joiner.accessToken, {});
  assert(nonStaffOverview.status >= 400, "non-staff rejected from get_custody_overview");

  console.log("\n--- cleanup ---");
  await adminClient.from("staff_users").delete().eq("user_id", admin.userId);
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.from("groups").delete().eq("id", matchingGroupId);
  for (const u of [admin, joiner]) {
    await adminClient.auth.admin.deleteUser(u.userId).catch((e) =>
      console.log("cleanup user delete failed", u.userId, e.message),
    );
  }

  console.log("\nAll late payment + custody reporting checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
