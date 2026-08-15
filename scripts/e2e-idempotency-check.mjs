// Verifies the idempotency fixes: calling the same money-moving RPC
// twice in a row (simulating a double-click / retry-after-timeout)
// should reuse the existing pending record instead of creating a
// second one.
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

  console.log("--- Login two test users ---");
  const alice = await loginAs("+250788000111");
  const bob = await loginAs("+250788000222");

  console.log("--- Wallet top-up: two rapid calls should reuse the same pending row ---");
  await rpc("consent_to_personal_wallet", alice.accessToken, {});
  const ref1 = crypto.randomUUID();
  const first = await rpc("initiate_wallet_topup", alice.accessToken, {
    p_amount: 5000,
    p_phone: "+250788000111",
    p_reference_id: ref1,
  });
  const [firstRow] = await first.json();
  assert(first.ok, "first initiate_wallet_topup call succeeds");
  assert(firstRow.is_new === true, "first call reports is_new = true");

  // initiate_wallet_topup also has its own independent 5s rate limit
  // (unrelated to the dedupe logic being tested here) - wait past it so
  // this second call actually exercises the dedupe path instead of just
  // hitting the rate limiter.
  await new Promise((r) => setTimeout(r, 6000));

  const ref2 = crypto.randomUUID();
  const second = await rpc("initiate_wallet_topup", alice.accessToken, {
    p_amount: 5000,
    p_phone: "+250788000111",
    p_reference_id: ref2,
  });
  const [secondRow] = await second.json();
  assert(second.ok, "second initiate_wallet_topup call succeeds");
  assert(secondRow.is_new === false, "second call reports is_new = false (reused, not a new charge)");
  assert(secondRow.id === firstRow.id, "second call returns the SAME transaction id as the first");
  assert(secondRow.reference_id === ref1, "second call returns the FIRST call's real MoMo reference, not the second's — proves no second charge would fire");

  const { data: topups } = await adminClient
    .from("wallet_transactions")
    .select("id")
    .eq("user_id", alice.userId)
    .eq("type", "topup")
    .eq("status", "pending");
  assert(topups.length === 1, "exactly one pending topup row exists in the database, not two");

  console.log("--- P2P request: two rapid identical requests should reuse the same row ---");
  const p2p1 = await rpc("create_p2p_request", alice.accessToken, {
    p_contact: "+250788000222",
    p_direction: "send",
    p_amount: 3000,
    p_note: "test",
  });
  const p2p1Id = await p2p1.json();
  assert(p2p1.ok, "first create_p2p_request succeeds");

  // Same independent rate-limit consideration as above.
  await new Promise((r) => setTimeout(r, 6000));

  const p2p2 = await rpc("create_p2p_request", alice.accessToken, {
    p_contact: "+250788000222",
    p_direction: "send",
    p_amount: 3000,
    p_note: "test again",
  });
  const p2p2Id = await p2p2.json();
  assert(p2p2.ok, "second create_p2p_request succeeds");
  assert(p2p2Id === p2p1Id, "second call returns the SAME request id as the first, not a duplicate");

  const { data: p2pRows } = await adminClient
    .from("p2p_requests")
    .select("id")
    .eq("initiator_id", alice.userId)
    .eq("status", "pending");
  assert(p2pRows.length === 1, "exactly one pending p2p_requests row exists, not two");

  console.log("--- Cleanup ---");
  await adminClient.from("wallet_transactions").delete().eq("user_id", alice.userId);
  await adminClient.from("wallet_consents").delete().eq("user_id", alice.userId);
  await adminClient.from("p2p_requests").delete().eq("initiator_id", alice.userId);
  await adminClient.auth.admin.deleteUser(alice.userId);
  await adminClient.auth.admin.deleteUser(bob.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
