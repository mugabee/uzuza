// Repeatable Phase 2 regression check: two members join a group, admin
// starts a cycle, both submit proof (including a real file upload to
// Storage), admin confirms both, cycle should flip to completed. Requires
// sms_test_otp registered for both numbers below (see e2e-check.mjs).
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

const ADMIN_PHONE = "+250788000111";
const MEMBER_PHONE = "+250788000222";
const TEST_OTP = "123456";

// 1x1 transparent PNG.
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
  return rest(`rpc/${name}`, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function main() {
  console.log("--- Login admin + member ---");
  const admin = await loginAs(ADMIN_PHONE);
  const member = await loginAs(MEMBER_PHONE);
  console.log("admin:", admin.userId, "| member:", member.userId);

  console.log("--- Admin creates group (target_size 2) ---");
  const createRes = await rpc("create_group", admin.accessToken, {
    p_name: "Phase 2 E2E Group",
    p_group_type: "rotating",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 2,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
  });
  const groupId = await createRes.json();
  console.log(createRes.status, groupId);

  console.log("--- Member joins group ---");
  const joinRes = await rpc("join_group", member.accessToken, {
    p_group_id: groupId,
  });
  console.log(joinRes.status, await joinRes.text());

  console.log("--- Admin sets momo number ---");
  const momoRes = await rpc("set_group_momo_number", admin.accessToken, {
    p_group_id: groupId,
    p_momo_number: "+250788000999",
  });
  console.log(momoRes.status, await momoRes.text());

  console.log("--- Admin starts cycle ---");
  const cycleRes = await rpc("start_cycle", admin.accessToken, {
    p_group_id: groupId,
  });
  const cycleId = await cycleRes.json();
  console.log(cycleRes.status, cycleId);

  console.log("--- Fetch contributions for this cycle (as admin) ---");
  const contribRes = await rest(
    `contributions?cycle_id=eq.${cycleId}&select=*`,
    admin.accessToken,
  );
  const contributions = await contribRes.json();
  console.log(contribRes.status, contributions.map((c) => [c.member_id, c.id]));

  const adminContribution = contributions.find((c) => c.member_id === admin.userId);
  const memberContribution = contributions.find((c) => c.member_id === member.userId);

  for (const [who, token, contribution] of [
    ["admin", admin.accessToken, adminContribution],
    ["member", member.accessToken, memberContribution],
  ]) {
    console.log(`--- ${who} uploads screenshot ---`);
    const path = `${contribution.id}/test.png`;
    const uploadRes = await fetch(
      `${BASE}/storage/v1/object/contribution-proofs/${path}`,
      {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/png",
        },
        body: TINY_PNG,
      },
    );
    console.log(uploadRes.status, await uploadRes.text());

    console.log(`--- ${who} submits proof ---`);
    const submitRes = await rpc("submit_contribution_proof", token, {
      p_contribution_id: contribution.id,
      p_transaction_id: `TEST-TXN-${who.toUpperCase()}`,
      p_screenshot_path: path,
    });
    console.log(submitRes.status, await submitRes.text());
  }

  console.log("--- Admin confirms both ---");
  for (const contribution of [adminContribution, memberContribution]) {
    const confirmRes = await rpc("confirm_contribution", admin.accessToken, {
      p_contribution_id: contribution.id,
      p_approve: true,
      p_reason: null,
    });
    console.log(confirmRes.status, await confirmRes.text());
  }

  console.log("--- Check cycle status ---");
  const finalCycleRes = await rest(
    `cycles?id=eq.${cycleId}&select=*`,
    admin.accessToken,
  );
  console.log(finalCycleRes.status, await finalCycleRes.text());

  console.log("--- Cleanup ---");
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await adminClient.storage
    .from("contribution-proofs")
    .remove([`${adminContribution.id}/test.png`, `${memberContribution.id}/test.png`]);
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.auth.admin.deleteUser(admin.userId);
  await adminClient.auth.admin.deleteUser(member.userId);
  console.log("cleaned up.");
}

main();
