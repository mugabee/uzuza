// Repeatable Phase 7 regression check: consent required before a group
// can go uzuza_held, the platform custody cap actually rejecting a
// confirmation that would breach it (not just the happy path), and the
// deployed cron route genuinely disbursing via the sandbox Disbursements
// API and marking everything swept. Requires the app to already be
// deployed (the cron route needs a public HTTPS URL, same constraint as
// the Phase 1 Send SMS Hook).
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

  // Give the recipient a phone number the disbursement can target.
  await adminClient.from("profiles").update({ phone: "+250788123456" }).eq("id", admin.userId);

  console.log("--- admin creates a group, member joins ---");
  const createRes = await rpc("create_group", admin.accessToken, {
    p_name: "Phase 7 E2E Group", p_group_type: "rotating", p_contribution_amount: 25000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const groupId = await createRes.json();
  await rpc("join_group", member.accessToken, { p_group_id: groupId });

  console.log("--- consent is required before going uzuza_held ---");
  const noConsentRes = await rpc("set_account_type", admin.accessToken, {
    p_group_id: groupId, p_account_type: "uzuza_held", p_consent: false,
  });
  assert(noConsentRes.status >= 400, "switching to uzuza_held without consent is rejected");

  const consentRes = await rpc("set_account_type", admin.accessToken, {
    p_group_id: groupId, p_account_type: "uzuza_held", p_consent: true,
  });
  assert(consentRes.status < 300, "switching with consent succeeds");

  const consentCheckRes = await rest(
    `custody_consents?group_id=eq.${groupId}&user_id=eq.${admin.userId}`,
    admin.accessToken,
  );
  const consentCheck = await consentCheckRes.json();
  assert(consentCheck.length === 1, "consent recorded");

  console.log("--- start cycle, both submit proof ---");
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

  console.log("--- lower the platform cap to prove it actually blocks confirmation ---");
  await adminClient.from("platform_settings").update({ custody_cap_amount: 1000 }).eq("id", 1);

  const blockedConfirmRes = await rpc("confirm_contribution", admin.accessToken, {
    p_contribution_id: contributions[0].id, p_approve: true, p_reason: null,
  });
  assert(blockedConfirmRes.status >= 400, "confirmation rejected — would breach the platform cap");

  console.log("--- restore the cap, confirm both for real ---");
  await adminClient.from("platform_settings").update({ custody_cap_amount: 5000000 }).eq("id", 1);

  for (const c of contributions) {
    const confirmRes = await rpc("confirm_contribution", admin.accessToken, {
      p_contribution_id: c.id, p_approve: true, p_reason: null,
    });
    assert(confirmRes.status < 300, `contribution ${c.id} confirmed`);
  }

  const custodyRes = await rest(`custody_ledger?group_id=eq.${groupId}&select=*`, admin.accessToken);
  const custody = await custodyRes.json();
  assert(custody.length === 2, "two custody_ledger entries recorded (one per confirmed contribution)");
  assert(custody.every((c) => c.swept_at === null), "nothing swept yet");

  console.log("--- request + approve payout ---");
  const payoutRes = await rpc("request_payout", admin.accessToken, { p_cycle_id: cycleId });
  const payoutId = await payoutRes.json();
  await rpc("approve_payout", admin.accessToken, { p_payout_request_id: payoutId });
  const approvedRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, admin.accessToken);
  const [approved] = await approvedRes.json();
  assert(approved.status === "approved", "payout approved, ready for sweep-out");

  console.log("--- unauthenticated cron call is rejected ---");
  const noAuthRes = await fetch(`${APP_URL}/api/cron/sweep-out`);
  assert(noAuthRes.status === 401, "cron route rejects calls without the secret");

  console.log("--- invoke the real deployed cron route ---");
  const cronRes = await fetch(`${APP_URL}/api/cron/sweep-out`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const cronBody = await cronRes.json();
  console.log(cronRes.status, cronBody);
  assert(cronRes.status === 200, "cron route runs successfully");
  assert(cronBody.results[payoutId] === "swept", "our payout was actually swept");

  const finalPayoutRes = await rest(`payout_requests?id=eq.${payoutId}&select=*`, admin.accessToken);
  const [finalPayout] = await finalPayoutRes.json();
  assert(finalPayout.status === "completed", "payout marked completed by the automated job");
  assert(finalPayout.swept_at !== null, "swept_at recorded");
  assert(finalPayout.transaction_id !== null, "real disbursement transaction ID recorded");

  const finalCustodyRes = await rest(`custody_ledger?group_id=eq.${groupId}&select=*`, admin.accessToken);
  const finalCustody = await finalCustodyRes.json();
  assert(finalCustody.every((c) => c.swept_at !== null), "all custody entries marked swept");

  console.log("--- Cleanup ---");
  await adminClient.storage
    .from("contribution-proofs")
    .remove(contributions.map((c) => `${c.id}/test.png`));
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.auth.admin.deleteUser(admin.userId);
  await adminClient.auth.admin.deleteUser(member.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
