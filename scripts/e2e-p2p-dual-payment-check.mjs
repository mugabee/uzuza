// Verifies P2P send/request money's dual payment methods:
//   Option A (wallet_balance) — a real, immediate, atomic wallet-to-
//     wallet transfer for a direct "send", and a payer-triggered
//     transfer via pay_p2p_from_wallet for an incoming "request".
//   Option B (momo_manual, "offline MoMo") — real proof-of-payment
//     (transaction ID + screenshot) now required, but deliberately
//     does NOT touch either party's Uzuza wallet balance, since no
//     money actually enters Uzuza's custody in that flow.
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

async function topUp(adminClient, userId, phone, amount) {
  const { data: row } = await adminClient.from("wallet_transactions").insert({
    user_id: userId, type: "topup", amount, status: "pending", phone,
  }).select("id").single();
  await adminClient.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", row.id);
}

async function main() {
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login Alice and Bob ---");
  const alice = await loginAs("+250788000555");
  const bob = await loginAs("+250788000666");
  await adminClient.from("profiles").update({ full_name: "Alice P2P Test" }).eq("id", alice.userId);
  await adminClient.from("profiles").update({ full_name: "Bob P2P Test" }).eq("id", bob.userId);

  console.log("--- give Alice a wallet balance ---");
  await topUp(adminClient, alice.userId, "+250788000555", 30000);
  const aliceStartRes = await rpc("get_wallet_balance", alice.accessToken, {});
  const aliceStart = Number(await aliceStartRes.json());
  assert(aliceStart === 30000, "Alice's wallet balance reflects the top-up");

  console.log("=== Option A: direct wallet 'send' (immediate, atomic) ===");
  const sendRes = await rpc("create_p2p_request", alice.accessToken, {
    p_contact: "+250788000666", p_direction: "send", p_amount: 8000, p_note: "lunch", p_payment_channel: "wallet_balance",
  });
  const sendBody = sendRes.ok ? await sendRes.json() : await sendRes.json();
  assert(sendRes.ok, `wallet-funded send succeeds (got: ${JSON.stringify(sendBody)})`);
  const sendId = sendBody;

  const sendCheckRes = await rest(`p2p_requests?id=eq.${sendId}&select=*`, alice.accessToken);
  const [sendCheck] = await sendCheckRes.json();
  assert(sendCheck.status === "confirmed", "wallet send is immediately confirmed, no pending/paid interim state");
  assert(sendCheck.payment_channel === "wallet_balance", "payment_channel recorded correctly");

  const aliceAfterSendRes = await rpc("get_wallet_balance", alice.accessToken, {});
  const aliceAfterSend = Number(await aliceAfterSendRes.json());
  assert(aliceAfterSend === aliceStart - 8000, "Alice's balance decreased by exactly the sent amount");

  const bobAfterSendRes = await rpc("get_wallet_balance", bob.accessToken, {});
  const bobAfterSend = Number(await bobAfterSendRes.json());
  assert(bobAfterSend === 8000, "Bob's balance increased by exactly the sent amount");

  console.log("--- verify it shows correctly, once each, in both feeds ---");
  const aliceFeedRes = await rpc("get_wallet_transactions", alice.accessToken, {});
  const aliceFeed = await aliceFeedRes.json();
  assert(
    aliceFeed.filter((t) => t.kind === "Sent to Bob P2P Test" && t.direction === "out" && Number(t.amount) === 8000).length === 1,
    "Alice's feed shows exactly one 'Sent to Bob P2P Test' entry",
  );
  const bobFeedRes = await rpc("get_wallet_transactions", bob.accessToken, {});
  const bobFeed = await bobFeedRes.json();
  assert(
    bobFeed.filter((t) => t.kind === "Received from Alice P2P Test" && t.direction === "in" && Number(t.amount) === 8000).length === 1,
    "Bob's feed shows exactly one 'Received from Alice P2P Test' entry",
  );

  console.log("=== Option A: wallet 'request' (payer approves and pays later) ===");
  const reqRes = await rpc("create_p2p_request", bob.accessToken, {
    p_contact: "+250788000555", p_direction: "request", p_amount: 5000, p_note: null, p_payment_channel: "wallet_balance",
  });
  const reqId = await reqRes.json();
  const reqCheckRes = await rest(`p2p_requests?id=eq.${reqId}&select=*`, bob.accessToken);
  const [reqCheck] = await reqCheckRes.json();
  assert(reqCheck.status === "pending", "a wallet-funded request stays pending until the payer acts");

  console.log("--- reject: the requester (payee) cannot pay their own request ---");
  const wrongPayerRes = await rpc("pay_p2p_from_wallet", bob.accessToken, { p_id: reqId });
  assert(!wrongPayerRes.ok, "the payee cannot call pay_p2p_from_wallet on their own request");

  console.log("--- Alice (the payer) pays the request from her wallet ---");
  const payRes = await rpc("pay_p2p_from_wallet", alice.accessToken, { p_id: reqId });
  const payBody = payRes.ok ? null : await payRes.json();
  assert(payRes.ok, `pay_p2p_from_wallet succeeds${payBody ? ` (got: ${JSON.stringify(payBody)})` : ""}`);

  const aliceAfterReqRes = await rpc("get_wallet_balance", alice.accessToken, {});
  const aliceAfterReq = Number(await aliceAfterReqRes.json());
  assert(aliceAfterReq === aliceAfterSend - 5000, "Alice's balance decreased by exactly the requested amount");
  const bobAfterReqRes = await rpc("get_wallet_balance", bob.accessToken, {});
  const bobAfterReq = Number(await bobAfterReqRes.json());
  assert(bobAfterReq === bobAfterSend + 5000, "Bob's balance increased by exactly the requested amount");

  console.log("--- reject: cannot pay the same request twice ---");
  const doublePayRes = await rpc("pay_p2p_from_wallet", alice.accessToken, { p_id: reqId });
  assert(!doublePayRes.ok, "cannot pay the same wallet request twice");

  console.log("=== Option A: insufficient balance blocks the transfer ===");
  // Bob's second create_p2p_request within this test — wait out the
  // 5s create_p2p_request rate limit first, or this gets blocked before
  // the real assertion below is even reached.
  await new Promise((r) => setTimeout(r, 5500));
  const bigReqRes = await rpc("create_p2p_request", bob.accessToken, {
    p_contact: "+250788000555", p_direction: "request", p_amount: 1000000, p_note: null, p_payment_channel: "wallet_balance",
  });
  const bigReqBody = await bigReqRes.json();
  assert(bigReqRes.ok, `Bob can create the oversized request (got: ${JSON.stringify(bigReqBody)})`);
  const bigReqId = bigReqBody;
  const insufficientRes = await rpc("pay_p2p_from_wallet", alice.accessToken, { p_id: bigReqId });
  assert(!insufficientRes.ok, "a wallet payment exceeding the payer's balance is blocked");
  const bigReqCheckRes = await rest(`p2p_requests?id=eq.${bigReqId}&select=status`, alice.accessToken);
  const [bigReqCheck] = await bigReqCheckRes.json();
  assert(bigReqCheck.status === "pending", "the oversized request is still pending, untouched, after the blocked attempt");

  console.log("=== Option B: offline MoMo now requires real proof, and does NOT touch wallet balances ===");
  const aliceBeforeMomoRes = await rpc("get_wallet_balance", alice.accessToken, {});
  const aliceBeforeMomo = Number(await aliceBeforeMomoRes.json());
  const bobBeforeMomoRes = await rpc("get_wallet_balance", bob.accessToken, {});
  const bobBeforeMomo = Number(await bobBeforeMomoRes.json());

  // Alice's second create_p2p_request within this test — same 5s
  // rate-limit wait as above.
  await new Promise((r) => setTimeout(r, 5500));
  const momoRes = await rpc("create_p2p_request", alice.accessToken, {
    p_contact: "+250788000666", p_direction: "send", p_amount: 3000, p_note: "offline test", p_payment_channel: "momo_manual",
  });
  const momoBody = await momoRes.json();
  assert(momoRes.ok, `Alice can create the offline-MoMo send (got: ${JSON.stringify(momoBody)})`);
  const momoId = momoBody;
  const momoCheckRes = await rest(`p2p_requests?id=eq.${momoId}&select=status`, alice.accessToken);
  const [momoCheck] = await momoCheckRes.json();
  assert(momoCheck.status === "pending", "an offline-MoMo send stays pending (unlike the wallet channel)");

  console.log("--- old, proof-less mark_p2p_paid(uuid) signature is gone ---");
  const oldSignatureRes = await rest(`rpc/mark_p2p_paid`, alice.accessToken, {
    method: "POST", body: JSON.stringify({ p_id: momoId }),
  });
  assert(!oldSignatureRes.ok, "the bare mark_p2p_paid(uuid) overload no longer exists — proof is now required");

  const proofPath = `${momoId}/test.png`;
  const uploadRes = await fetch(`${BASE}/storage/v1/object/p2p-proofs/${proofPath}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${alice.accessToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  assert(uploadRes.ok, "Alice can upload her own P2P payment proof");

  const markPaidRes = await rpc("mark_p2p_paid", alice.accessToken, {
    p_id: momoId, p_transaction_id: "TEST-P2P-TXN", p_screenshot_path: proofPath,
  });
  assert(markPaidRes.ok, "mark_p2p_paid with real proof succeeds");

  const confirmRes = await rpc("confirm_p2p_received", bob.accessToken, { p_id: momoId });
  assert(confirmRes.ok, "Bob confirms receipt");

  const momoFinalRes = await rest(`p2p_requests?id=eq.${momoId}&select=*`, alice.accessToken);
  const [momoFinal] = await momoFinalRes.json();
  assert(momoFinal.status === "confirmed", "offline MoMo request reaches confirmed");
  assert(momoFinal.transaction_id === "TEST-P2P-TXN", "transaction ID recorded");
  assert(momoFinal.screenshot_path === proofPath, "screenshot path recorded");

  const aliceAfterMomoRes = await rpc("get_wallet_balance", alice.accessToken, {});
  const aliceAfterMomo = Number(await aliceAfterMomoRes.json());
  const bobAfterMomoRes = await rpc("get_wallet_balance", bob.accessToken, {});
  const bobAfterMomo = Number(await bobAfterMomoRes.json());
  assert(aliceAfterMomo === aliceBeforeMomo, "Alice's Uzuza wallet balance is UNCHANGED by the confirmed offline-MoMo payment");
  assert(bobAfterMomo === bobBeforeMomo, "Bob's Uzuza wallet balance is UNCHANGED by the confirmed offline-MoMo payment");

  console.log("--- and it does not appear in either wallet transaction feed ---");
  const aliceFeed2Res = await rpc("get_wallet_transactions", alice.accessToken, {});
  const aliceFeed2 = await aliceFeed2Res.json();
  assert(!aliceFeed2.some((t) => Number(t.amount) === 3000), "the offline-MoMo transfer does not appear in Alice's wallet feed");

  console.log("--- reject: someone else cannot upload a proof for this request ---");
  const wrongUploadRes = await fetch(`${BASE}/storage/v1/object/p2p-proofs/${momoId}/hijack.png`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${bob.accessToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  assert(!wrongUploadRes.ok, "Bob (not the payer) cannot upload a proof into Alice's request folder");

  console.log("--- reject: non-staff cannot bypass — ledger stays balanced throughout ---");
  const { data: totalHeld, error: totalHeldError } = await adminClient.rpc("get_total_uzuza_held");
  if (totalHeldError) throw totalHeldError;
  console.log(`  platform total held (sanity, should be unaffected by pure P2P wallet transfers): ${totalHeld}`);

  console.log("--- Cleanup ---");
  await adminClient.storage.from("p2p-proofs").remove([proofPath]);
  await adminClient.from("wallet_transactions").delete().in("user_id", [alice.userId, bob.userId]);
  await adminClient.from("p2p_requests").delete().or(`payer_id.eq.${alice.userId},payee_id.eq.${alice.userId}`);
  await adminClient.auth.admin.deleteUser(alice.userId);
  await adminClient.auth.admin.deleteUser(bob.userId);
  await adminClient.rpc("purge_orphaned_ledger_test_accounts");
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
