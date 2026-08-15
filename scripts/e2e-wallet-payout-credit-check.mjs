// Verifies the wallet-balance fix: a uzuza_held group's payout should
// credit the recipient's personal wallet (not just mark the payout
// "completed" with no trace of it anywhere the user can see), and the
// platform custody cap check should now see wallet funds too.
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const APP_URL = process.env.APP_URL ?? "https://uzuza-v7cu.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET;
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

async function main() {
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login admin + member ---");
  const admin = await loginAs("+250788000111");
  const member = await loginAs("+250788000222");

  await adminClient.from("profiles").update({ phone: "+250788123456" }).eq("id", admin.userId);

  console.log("--- admin creates a group, member joins ---");
  const createRes = await rpc("create_group", admin.accessToken, {
    p_name: "Wallet Credit E2E Group", p_group_type: "rotating", p_contribution_amount: 25000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const groupId = await createRes.json();
  await rpc("join_group", member.accessToken, { p_group_id: groupId });

  console.log("--- switch to uzuza_held ---");
  await rpc("set_account_type", admin.accessToken, {
    p_group_id: groupId, p_account_type: "uzuza_held", p_consent: true,
  });

  console.log("--- record admin's starting wallet balance ---");
  const startBalRes = await rpc("get_wallet_balance", admin.accessToken, {});
  const startBalance = Number(await startBalRes.json());
  console.log(`  admin's wallet balance before payout: ${startBalance} RWF`);

  console.log("--- start cycle, both submit proof, both confirmed ---");
  await rpc("set_group_momo_number", admin.accessToken, {
    p_group_id: groupId, p_momo_number: "+250788000999",
  });
  const cycleRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
  const cycleId = await cycleRes.json();

  const contribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=*`, admin.accessToken);
  const contributions = await contribRes.json();

  for (const c of contributions) {
    const token = [admin, member].find((u) => u.userId === c.member_id).accessToken;
    const path = `${c.id}/test.png`;
    await fetch(`${BASE}/storage/v1/object/contribution-proofs/${path}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "image/png" },
      body: TINY_PNG,
    });
    await rpc("submit_contribution_proof", token, {
      p_contribution_id: c.id, p_transaction_id: "TEST-TXN", p_screenshot_path: path,
    });
  }

  let recipientId = null;
  for (const c of contributions) {
    const confirmRes = await rpc("confirm_contribution", admin.accessToken, {
      p_contribution_id: c.id, p_approve: true, p_reason: null,
    });
    assert(confirmRes.status < 300, `contribution ${c.id} confirmed`);
  }

  console.log("--- request + approve payout ---");
  const payoutRes = await rpc("request_payout", admin.accessToken, { p_cycle_id: cycleId });
  const payoutId = await payoutRes.json();
  const payoutInfoRes = await rest(`payout_requests?id=eq.${payoutId}&select=recipient_user_id,amount`, admin.accessToken);
  const [payoutInfo] = await payoutInfoRes.json();
  recipientId = payoutInfo.recipient_user_id;
  const payoutAmount = Number(payoutInfo.amount);
  console.log(`  recipient: ${recipientId}, amount: ${payoutAmount}`);

  await rpc("approve_payout", admin.accessToken, { p_payout_request_id: payoutId });

  console.log("--- invoke the real deployed sweep-out cron route ---");
  const cronRes = await fetch(`${APP_URL}/api/cron/sweep-out`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const cronBody = await cronRes.json();
  console.log(cronRes.status, cronBody);
  assert(cronRes.status === 200, "cron route runs successfully");
  assert(cronBody.results[payoutId] === "credited to wallet", "our payout was credited to the recipient's wallet");

  const finalPayoutRes = await rest(`payout_requests?id=eq.${payoutId}&select=*`, admin.accessToken);
  const [finalPayout] = await finalPayoutRes.json();
  assert(finalPayout.status === "completed", "payout marked completed");
  assert(finalPayout.swept_at !== null, "swept_at recorded");
  assert(finalPayout.transaction_id?.startsWith("WALLET-"), "transaction_id references the wallet credit");

  const recipientToken = recipientId === admin.userId ? admin.accessToken : member.accessToken;

  console.log("--- verify the recipient's wallet balance actually increased ---");
  const newBalRes = await rpc("get_wallet_balance", recipientToken, {});
  const newBalance = Number(await newBalRes.json());
  console.log(`  recipient's wallet balance after payout: ${newBalance} RWF`);
  const expectedBalance = recipientId === admin.userId ? startBalance + payoutAmount : payoutAmount;
  assert(newBalance === expectedBalance, `wallet balance increased by exactly the payout amount (${expectedBalance})`);

  console.log("--- verify it shows up in the transaction feed, exactly once ---");
  const txRes = await rpc("get_wallet_transactions", recipientToken, {});
  const transactions = await txRes.json();
  const matching = transactions.filter(
    (t) => t.kind === "Payout received" && Number(t.amount) === payoutAmount && t.group_name === "Wallet Credit E2E Group",
  );
  assert(matching.length === 1, "payout appears exactly once in the transaction feed (no double-count)");

  console.log("--- verify the custody_ledger entries are marked swept ---");
  const finalCustodyRes = await rest(`custody_ledger?group_id=eq.${groupId}&select=*`, admin.accessToken);
  const finalCustody = await finalCustodyRes.json();
  assert(finalCustody.every((c) => c.swept_at !== null), "all custody entries marked swept");

  console.log("--- verify get_total_uzuza_held() actually includes wallet funds ---");
  const { data: totalHeld, error: totalHeldError } = await adminClient.rpc("get_total_uzuza_held");
  if (totalHeldError) throw totalHeldError;
  assert(Number(totalHeld) >= payoutAmount, "platform total-held figure includes the new wallet credit");

  console.log("--- Cleanup ---");
  await adminClient.storage
    .from("contribution-proofs")
    .remove(contributions.map((c) => `${c.id}/test.png`));
  await adminClient.from("wallet_transactions").delete().eq("source_group_id", groupId);
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.auth.admin.deleteUser(admin.userId);
  await adminClient.auth.admin.deleteUser(member.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
