// Repeatable Phase 5 regression check: a matching group (target_size 2,
// so the creator/admin fills one spot and a single reservation fills the
// other), full find -> reserve -> proof -> confirm -> auto-activate loop,
// chat while forming (including link-rejection) and chat blocked once
// active, and start_cycle correctly treating the confirmed reservation as
// an already-confirmed first contribution.
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

async function main() {
  console.log("--- Login three test users ---");
  const admin = await loginAs("+250788000111");
  const joiner = await loginAs("+250788000222");
  const outsider = await loginAs("+250788000333");
  console.log("admin:", admin.userId, "joiner:", joiner.userId, "outsider:", outsider.userId);

  console.log("--- admin creates a matching group (target_size 2) ---");
  const createRes = await rpc("create_group", admin.accessToken, {
    p_name: "Phase 5 E2E Group",
    p_group_type: "rotating",
    p_contribution_amount: 20000,
    p_frequency: "monthly",
    p_target_size: 2,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
    p_is_matching_group: true,
  });
  const groupId = await createRes.json();
  console.log(createRes.status, groupId);

  const groupCheckRes = await rest(`groups?id=eq.${groupId}&select=status,is_matching_group`, admin.accessToken);
  const [groupCheck] = await groupCheckRes.json();
  assert(groupCheck.status === "forming", "new matching group starts forming");
  assert(groupCheck.is_matching_group === true, "is_matching_group flag set");

  console.log("--- find_groups sees it (not full) ---");
  const findRes1 = await rpc("find_groups", outsider.accessToken, {});
  const found1 = await findRes1.json();
  assert(found1.some((g) => g.id === groupId), "group appears in find_groups while not full");

  console.log("--- chat while forming: admin sends, joiner can't send yet (not a member) ---");
  const chatBeforeJoinRes = await rpc("send_chat_message", admin.accessToken, {
    p_group_id: groupId,
    p_body: "Welcome, first come first served!",
  });
  assert(chatBeforeJoinRes.status < 300, "admin can chat before anyone else joins");

  console.log("--- link rejection ---");
  const linkRes = await rpc("send_chat_message", admin.accessToken, {
    p_group_id: groupId,
    p_body: "check this out http://example.com",
  });
  assert(linkRes.status >= 400, "message with a link is rejected");

  console.log("--- joiner reserves the remaining spot ---");
  const reserveRes = await rpc("reserve_spot", joiner.accessToken, { p_group_id: groupId });
  const reservationId = await reserveRes.json();
  console.log(reserveRes.status, reservationId);

  console.log("--- find_groups no longer shows it (now full) ---");
  const findRes2 = await rpc("find_groups", outsider.accessToken, {});
  const found2 = await findRes2.json();
  assert(!found2.some((g) => g.id === groupId), "group no longer in find_groups once full");

  console.log("--- joiner chats too ---");
  const joinerChatRes = await rpc("send_chat_message", joiner.accessToken, {
    p_group_id: groupId,
    p_body: "Excited to join!",
  });
  assert(joinerChatRes.status < 300, "joiner (prospective member) can chat");

  console.log("--- joiner uploads proof and submits ---");
  const proofPath = `${reservationId}/test.png`;
  await fetch(`${BASE}/storage/v1/object/reservation-proofs/${proofPath}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${joiner.accessToken}`,
      "Content-Type": "image/png",
    },
    body: TINY_PNG,
  });
  const submitRes = await rpc("submit_reservation_proof", joiner.accessToken, {
    p_reservation_id: reservationId,
    p_transaction_id: "RES-TXN-1",
    p_screenshot_path: proofPath,
  });
  assert(submitRes.status < 300, "reservation proof submitted");

  console.log("--- outsider cannot confirm (not an admin) ---");
  const badConfirmRes = await rpc("confirm_reservation", outsider.accessToken, {
    p_reservation_id: reservationId,
  });
  assert(badConfirmRes.status >= 400, "non-admin cannot confirm a reservation");

  console.log("--- admin confirms the reservation -> should auto-activate ---");
  const confirmRes = await rpc("confirm_reservation", admin.accessToken, {
    p_reservation_id: reservationId,
  });
  assert(confirmRes.status < 300, "admin confirms the reservation");

  const groupAfterRes = await rest(`groups?id=eq.${groupId}&select=status`, admin.accessToken);
  const [groupAfter] = await groupAfterRes.json();
  assert(groupAfter.status === "active", "group auto-activated once full and confirmed");

  const joinerRoleRes = await rest(
    `group_members?group_id=eq.${groupId}&user_id=eq.${joiner.userId}&select=role`,
    admin.accessToken,
  );
  const [joinerRole] = await joinerRoleRes.json();
  assert(joinerRole.role === "member", "joiner promoted from prospective to member");

  const custodyRes = await rest(`custody_ledger?group_id=eq.${groupId}&select=*`, admin.accessToken);
  const custody = await custodyRes.json();
  assert(custody.length === 1, "custody ledger recorded the reservation fee");
  assert(Number(custody[0].amount) === 1000, "custody amount is 5% of 20000");

  console.log("--- chat now blocked (group is active) ---");
  const chatAfterRes = await rpc("send_chat_message", admin.accessToken, {
    p_group_id: groupId,
    p_body: "still trying to chat",
  });
  assert(chatAfterRes.status >= 400, "chat rejected once group is active");

  console.log("--- start_cycle: joiner's confirmed reservation becomes an already-confirmed contribution ---");
  const cycleRes = await rpc("start_cycle", admin.accessToken, { p_group_id: groupId });
  const cycleId = await cycleRes.json();
  console.log(cycleRes.status, cycleId);

  const contribRes = await rest(`contributions?cycle_id=eq.${cycleId}&select=*`, admin.accessToken);
  const contributions = await contribRes.json();
  const joinerContribution = contributions.find((c) => c.member_id === joiner.userId);
  const adminContribution = contributions.find((c) => c.member_id === admin.userId);
  assert(joinerContribution.status === "confirmed", "joiner's cycle-1 contribution pre-confirmed from reservation");
  assert(joinerContribution.reservation_id === reservationId, "contribution traces back to the reservation");
  assert(adminContribution.status === "pending", "admin (no reservation) still owes a normal contribution");

  const cycleCheckRes = await rest(`cycles?id=eq.${cycleId}&select=status`, admin.accessToken);
  const [cycleCheck] = await cycleCheckRes.json();
  assert(cycleCheck.status === "active", "cycle not auto-completed since admin's contribution is still pending");

  console.log("--- Cleanup ---");
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await adminClient.storage.from("reservation-proofs").remove([proofPath]);
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.auth.admin.deleteUser(admin.userId);
  await adminClient.auth.admin.deleteUser(joiner.userId);
  await adminClient.auth.admin.deleteUser(outsider.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
