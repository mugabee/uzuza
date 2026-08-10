// Regression check for extending in-app chat beyond pre-activation: two
// members of an ordinary (already-active, non-matching) group can chat with
// each other, an outsider cannot read or send, and a removed member loses
// chat access even though their group_members row still exists.
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
  console.log("--- Login two members + one outsider ---");
  const admin = await loginAs("+250788004111");
  const member = await loginAs("+250788004222");
  const outsider = await loginAs("+250788004333");
  console.log("admin:", admin.userId, "member:", member.userId, "outsider:", outsider.userId);

  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- create an ordinary (already-active) rotating group ---");
  const createRes = await rpc("create_group", admin.accessToken, {
    p_name: "Active Chat Test Group",
    p_group_type: "rotating",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 3,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
  });
  console.log(createRes.status, createRes.data);
  assert(createRes.status < 300, "group created");
  const groupId = createRes.data;

  const { data: group } = await adminClient
    .from("groups")
    .select("id, status")
    .eq("id", groupId)
    .single();
  assert(group.status === "active", "ordinary group starts active, not forming");

  console.log("--- member joins via join_group ---");
  const joinRes = await rpc("join_group", member.accessToken, { p_group_id: groupId });
  console.log(joinRes.status, joinRes.data);
  assert(joinRes.status < 300, "member joined the active group");

  console.log("--- admin sends a chat message in the active group ---");
  const adminChat = await rpc("send_chat_message", admin.accessToken, {
    p_group_id: groupId,
    p_body: "Welcome to the group!",
  });
  console.log(adminChat.status, adminChat.data);
  assert(adminChat.status < 300, "admin can chat in an active group");

  console.log("--- member sends a chat message too ---");
  const memberChat = await rpc("send_chat_message", member.accessToken, {
    p_group_id: groupId,
    p_body: "Thanks, glad to be here",
  });
  console.log(memberChat.status, memberChat.data);
  assert(memberChat.status < 300, "member can chat in an active group");

  console.log("--- outsider cannot send ---");
  const outsiderChat = await rpc("send_chat_message", outsider.accessToken, {
    p_group_id: groupId,
    p_body: "I'm not in this group",
  });
  assert(outsiderChat.status >= 400, "outsider is rejected when sending");

  console.log("--- outsider cannot read messages (RLS) ---");
  const outsiderClient = createClient(BASE, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${outsider.accessToken}` } },
  });
  const { data: outsiderRead } = await outsiderClient
    .from("chat_messages")
    .select("id")
    .eq("group_id", groupId);
  assert((outsiderRead ?? []).length === 0, "outsider reads zero messages via RLS");

  console.log("--- member can read messages ---");
  const memberClient = createClient(BASE, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${member.accessToken}` } },
  });
  const { data: memberRead } = await memberClient
    .from("chat_messages")
    .select("id, body")
    .eq("group_id", groupId);
  assert((memberRead ?? []).length === 2, "member reads both messages");

  console.log("--- link rejection still enforced in active groups ---");
  const linkRes = await rpc("send_chat_message", member.accessToken, {
    p_group_id: groupId,
    p_body: "check this out https://example.com",
  });
  assert(linkRes.status >= 400, "message with a link is rejected");

  console.log("--- admin removes the member; removed member loses chat access ---");
  const removeRes = await rpc("remove_member", admin.accessToken, {
    p_group_id: groupId,
    p_user_id: member.userId,
  });
  console.log(removeRes.status, removeRes.data);
  assert(removeRes.status < 300, "admin removed the member");

  const removedChat = await rpc("send_chat_message", member.accessToken, {
    p_group_id: groupId,
    p_body: "can I still talk?",
  });
  assert(removedChat.status >= 400, "removed member is rejected when sending, despite row still existing");

  const { data: removedRead } = await memberClient
    .from("chat_messages")
    .select("id")
    .eq("group_id", groupId);
  assert((removedRead ?? []).length === 0, "removed member reads zero messages via RLS");

  console.log("--- cleanup ---");
  await adminClient.from("groups").delete().eq("id", groupId);
  for (const u of [admin, member, outsider]) {
    await adminClient.auth.admin.deleteUser(u.userId).catch((e) =>
      console.log("cleanup user delete failed", u.userId, e.message),
    );
  }

  console.log("\nAll active-group chat checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
