// Regression check for international payments: submit_contribution_proof,
// submit_pledge_proof, and submit_reservation_proof all accept the new
// optional payment_channel/payer_currency/payer_amount/fx_rate_to_rwf
// params, store them correctly, and old-style 3-arg calls (no new params)
// still work unmodified — verifying the DROP+CREATE migration didn't
// silently leave a duplicate overload or break existing callers.
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
  const admin = await loginAs("+250788005111");
  const joiner = await loginAs("+250788005222");
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

  console.log("\n=== 1. Contribution: international_manual (USD) ===");
  const groupRes = await rpc("create_group", admin.accessToken, {
    p_name: "Intl Payment Test Group",
    p_group_type: "rotating",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 2,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
  });
  assert(groupRes.status < 300, "rotating group created");
  const groupId = groupRes.data;

  const joinRes = await rpc("join_group", joiner.accessToken, { p_group_id: groupId });
  assert(joinRes.status < 300, "joiner joined");

  const startRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
  assert(startRes.status < 300, "cycle started");

  const { data: contributions } = await adminClient
    .from("contributions")
    .select("id, member_id")
    .eq("cycle_id", startRes.data);
  const adminContribution = contributions.find((c) => c.member_id === admin.userId);
  const joinerContribution = contributions.find((c) => c.member_id === joiner.userId);

  const proofPath1 = await uploadProof("contribution-proofs", admin.accessToken, adminContribution.id);
  const intlContribRes = await rpc("submit_contribution_proof", admin.accessToken, {
    p_contribution_id: adminContribution.id,
    p_transaction_id: "WISE-TEST-REF-001",
    p_screenshot_path: proofPath1,
    p_payment_channel: "international_manual",
    p_payer_currency: "usd",
    p_payer_amount: 40,
    p_fx_rate_to_rwf: 625,
  });
  assert(intlContribRes.status < 300, "international contribution proof submitted");

  const { data: contribRow } = await adminClient
    .from("contributions")
    .select("payment_channel, payer_currency, payer_amount, fx_rate_to_rwf, status")
    .eq("id", adminContribution.id)
    .single();
  assert(contribRow.payment_channel === "international_manual", "channel stored correctly");
  assert(contribRow.payer_currency === "USD", "currency uppercased and stored");
  assert(Number(contribRow.payer_amount) === 40, "payer_amount stored");
  assert(Number(contribRow.fx_rate_to_rwf) === 625, "fx_rate_to_rwf stored");
  assert(contribRow.status === "submitted", "status advanced normally");

  console.log("--- backward compatibility: old 3-arg call still works ---");
  const proofPath2 = await uploadProof("contribution-proofs", joiner.accessToken, joinerContribution.id);
  const legacyRes = await rpc("submit_contribution_proof", joiner.accessToken, {
    p_contribution_id: joinerContribution.id,
    p_transaction_id: "MP240613.1234.LEGACY",
    p_screenshot_path: proofPath2,
  });
  assert(legacyRes.status < 300, "legacy 3-arg call still succeeds");
  const { data: legacyRow } = await adminClient
    .from("contributions")
    .select("payment_channel, payer_currency, payer_amount")
    .eq("id", joinerContribution.id)
    .single();
  assert(legacyRow.payment_channel === "momo_manual", "legacy call defaults to momo_manual");
  assert(legacyRow.payer_currency === "RWF", "legacy call defaults currency to RWF");
  assert(legacyRow.payer_amount === null, "legacy call leaves payer_amount null");

  console.log("\n=== 2. Event pledge: momo_remittance (GBP) ===");
  const eventGroupRes = await rpc("create_group", admin.accessToken, {
    p_name: "Intl Pledge Test Event",
    p_group_type: "event",
    p_contribution_amount: 0,
    p_frequency: "monthly",
    p_target_size: 50,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
  });
  assert(eventGroupRes.status < 300, "event group created");
  const eventGroupId = eventGroupRes.data;

  const pledgeRes = await rpc("create_pledge", joiner.accessToken, {
    p_group_id: eventGroupId,
    p_amount: 30000,
    p_visibility: "public",
  });
  assert(pledgeRes.status < 300, "pledge created");
  const pledgeId = pledgeRes.data;

  const proofPath3 = await uploadProof("pledge-proofs", joiner.accessToken, pledgeId);
  const pledgeProofRes = await rpc("submit_pledge_proof", joiner.accessToken, {
    p_pledge_id: pledgeId,
    p_transaction_id: "MTN-REM-TEST-002",
    p_screenshot_path: proofPath3,
    p_payment_channel: "momo_remittance",
    p_payer_currency: "gbp",
    p_payer_amount: 18,
    p_fx_rate_to_rwf: 1666.67,
  });
  assert(pledgeProofRes.status < 300, "international pledge proof submitted");

  const { data: pledgeRow } = await adminClient
    .from("event_pledges")
    .select("payment_channel, payer_currency, payer_amount")
    .eq("id", pledgeId)
    .single();
  assert(pledgeRow.payment_channel === "momo_remittance", "pledge channel stored correctly");
  assert(pledgeRow.payer_currency === "GBP", "pledge currency stored correctly");

  console.log("\n=== 3. Reservation: international_manual (EUR) ===");
  const matchingGroupRes = await rpc("create_group", admin.accessToken, {
    p_name: "Intl Reservation Test Group",
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

  const proofPath4 = await uploadProof("reservation-proofs", joiner.accessToken, reservationId);
  const reservationProofRes = await rpc("submit_reservation_proof", joiner.accessToken, {
    p_reservation_id: reservationId,
    p_transaction_id: "WISE-TEST-REF-003",
    p_screenshot_path: proofPath4,
    p_payment_channel: "international_manual",
    p_payer_currency: "eur",
    p_payer_amount: 1.6,
    p_fx_rate_to_rwf: 781.25,
  });
  assert(reservationProofRes.status < 300, "international reservation proof submitted");

  const { data: reservationRow } = await adminClient
    .from("reservations")
    .select("payment_channel, payer_currency, payer_amount")
    .eq("id", reservationId)
    .single();
  assert(reservationRow.payment_channel === "international_manual", "reservation channel stored correctly");
  assert(reservationRow.payer_currency === "EUR", "reservation currency stored correctly");

  console.log("\n--- cleanup ---");
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.from("groups").delete().eq("id", eventGroupId);
  await adminClient.from("groups").delete().eq("id", matchingGroupId);
  for (const u of [admin, joiner]) {
    await adminClient.auth.admin.deleteUser(u.userId).catch((e) =>
      console.log("cleanup user delete failed", u.userId, e.message),
    );
  }

  console.log("\nAll international payment checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
