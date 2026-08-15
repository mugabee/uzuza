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

  // set_account_type and confirm_contribution both require a verified
  // second factor once the group is uzuza_held (added in an earlier
  // session's Phase 10 MFA work) - and real TOTP enrollment is a known,
  // already-documented broken path on this project's hosted Supabase
  // instance (a GoTrue-side issue, not anything in this app's code).
  // Setting state directly via the service-role client for these two
  // setup steps only, so this check can still exercise the actual
  // sweep-to-wallet logic this session changed, rather than being
  // blocked by an unrelated, pre-existing infrastructure limitation.
  console.log("--- switch to uzuza_held (direct, MFA-gated RPC blocked by known TOTP infra issue) ---");
  await adminClient.from("groups").update({ account_type: "uzuza_held" }).eq("id", groupId);
  await adminClient.from("custody_consents").insert({ group_id: groupId, user_id: admin.userId });

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

  // confirm_contribution also requires MFA once the group is uzuza_held —
  // same known infra limitation, same direct-write workaround for setup.
  let recipientId = null;
  for (const c of contributions) {
    await adminClient.from("contributions").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", c.id);
    await adminClient.from("custody_ledger").insert({ group_id: groupId, contribution_id: c.id, amount: c.amount });
  }
  const confirmCheckRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=status`, admin.accessToken);
  const confirmCheck = await confirmCheckRes.json();
  assert(confirmCheck.every((c) => c.status === "confirmed"), "both contributions confirmed");
  // confirm_contribution normally flips this once every contribution is
  // in; replicating that here since we bypassed it above.
  await adminClient.from("cycles").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", cycleId);

  console.log("--- request + approve payout ---");
  const payoutRes = await rpc("request_payout", admin.accessToken, { p_cycle_id: cycleId });
  const payoutId = await payoutRes.json();
  const payoutInfoRes = await rest(`payout_requests?id=eq.${payoutId}&select=recipient_user_id,amount`, admin.accessToken);
  const [payoutInfo] = await payoutInfoRes.json();
  recipientId = payoutInfo.recipient_user_id;
  const payoutAmount = Number(payoutInfo.amount);
  console.log(`  recipient: ${recipientId}, amount: ${payoutAmount}`);

  // approve_payout requires MFA unconditionally — same known infra
  // limitation. Direct write mirrors what it does once threshold is met
  // (approval_threshold is '1' here, so a single approval suffices).
  await adminClient.from("payout_approvals").insert({ payout_request_id: payoutId, approved_by: admin.userId });
  await adminClient.from("payout_requests").update({ status: "approved" }).eq("id", payoutId);

  const statusCheckRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, admin.accessToken);
  const [statusCheck] = await statusCheckRes.json();
  console.log(`  payout status after approval: ${statusCheck.status}`);
  assert(statusCheck.status === "approved", "payout is actually in approved status");

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
