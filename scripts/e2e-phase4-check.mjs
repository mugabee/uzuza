// Repeatable Phase 4 regression check: constitution acknowledgment
// (recorded per member, not blocking anything yet) and the home-dashboard
// queries returning the right shape for a user in multiple groups.
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
  console.log("--- Login two test users ---");
  const user1 = await loginAs("+250788000111");
  const user2 = await loginAs("+250788000222");
  console.log("user1:", user1.userId, "user2:", user2.userId);

  console.log("--- user1 creates two groups ---");
  const group1Res = await rpc("create_group", user1.accessToken, {
    p_name: "Phase 4 Group A", p_group_type: "rotating", p_contribution_amount: 25000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const group1Id = await group1Res.json();
  const group2Res = await rpc("create_group", user1.accessToken, {
    p_name: "Phase 4 Group B", p_group_type: "rotating", p_contribution_amount: 10000,
    p_frequency: "weekly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const group2Id = await group2Res.json();
  console.log("group1:", group1Id, "group2:", group2Id);

  console.log("--- user2 joins group1 only ---");
  await rpc("join_group", user2.accessToken, { p_group_id: group1Id });

  console.log("--- Home dashboard query shape: user1 sees both groups ---");
  const membershipsRes = await rest(
    `group_members?user_id=eq.${user1.userId}&select=group_id`,
    user1.accessToken,
  );
  const memberships = await membershipsRes.json();
  assert(memberships.length === 2, "user1 has 2 memberships");

  const groupsRes = await rest(
    `groups?id=in.(${group1Id},${group2Id})&select=id,name,frequency,contribution_amount`,
    user1.accessToken,
  );
  const groups = await groupsRes.json();
  assert(groups.length === 2, "both groups fetched");
  const monthlyTotal = groups
    .filter((g) => g.frequency === "monthly")
    .reduce((s, g) => s + Number(g.contribution_amount), 0);
  const weeklyTotal = groups
    .filter((g) => g.frequency === "weekly")
    .reduce((s, g) => s + Number(g.contribution_amount), 0);
  assert(monthlyTotal === 25000, "monthly commitment total correct");
  assert(weeklyTotal === 10000, "weekly commitment total correct");

  console.log("--- Constitution: user1 acknowledges group1, user2 has not ---");
  await rpc("acknowledge_constitution", user1.accessToken, { p_group_id: group1Id });

  const ackRes = await rest(
    `constitution_acknowledgments?group_id=eq.${group1Id}&select=user_id`,
    user1.accessToken,
  );
  const acks = await ackRes.json();
  assert(acks.length === 1, "exactly one acknowledgment recorded");
  assert(acks[0].user_id === user1.userId, "user1 is the one who acknowledged");
  assert(
    !acks.some((a) => a.user_id === user2.userId),
    "user2 has not acknowledged yet",
  );

  console.log("--- non-member cannot acknowledge ---");
  const badAckRes = await rpc("acknowledge_constitution", user2.accessToken, {
    p_group_id: group2Id,
  });
  assert(badAckRes.status >= 400, "non-member acknowledge_constitution rejected");

  console.log("--- Cleanup ---");
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await adminClient.from("groups").delete().in("id", [group1Id, group2Id]);
  await adminClient.auth.admin.deleteUser(user1.userId);
  await adminClient.auth.admin.deleteUser(user2.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
