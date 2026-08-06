// Repeatable Phase 6 regression check: event group, three pledgers at
// different visibility tiers, masking verified from an outsider's
// perspective (not the organizer, not the pledger), cancellation before
// payment, proof + confirmation, and the payout flow reusing Phase 3's
// approve_payout/complete_payout completely unmodified.
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
  console.log("--- Login organizer, three pledgers, one outsider ---");
  const organizer = await loginAs("+250788000111");
  const pubPledger = await loginAs("+250788000222");
  const nameOnlyPledger = await loginAs("+250788000333");
  const outsider = await loginAs("+250788000444");

  console.log("--- organizer creates an event group ---");
  const createRes = await rpc("create_group", organizer.accessToken, {
    p_name: "Phase 6 E2E Wedding",
    p_group_type: "event",
    p_contribution_amount: 25000,
    p_frequency: "monthly",
    p_target_size: 20,
    p_account_type: "group_owned",
    p_rotation_method: "random",
    p_approval_threshold: "1",
    p_is_matching_group: false,
    p_pledge_goal: 100000,
  });
  const groupId = await createRes.json();
  console.log(createRes.status, groupId);

  await rpc("set_group_momo_number", organizer.accessToken, {
    p_group_id: groupId,
    p_momo_number: "+250788000999",
  });

  console.log("--- three pledges at different visibility tiers ---");
  const pubRes = await rpc("create_pledge", pubPledger.accessToken, {
    p_group_id: groupId, p_amount: 30000, p_visibility: "public",
  });
  const pubPledgeId = await pubRes.json();
  const nameOnlyRes = await rpc("create_pledge", nameOnlyPledger.accessToken, {
    p_group_id: groupId, p_amount: 20000, p_visibility: "name_only",
  });
  const nameOnlyPledgeId = await nameOnlyRes.json();
  const privateRes = await rpc("create_pledge", organizer.accessToken, {
    p_group_id: groupId, p_amount: 10000, p_visibility: "private",
  });
  const privatePledgeId = await privateRes.json();
  console.log("pledges:", pubPledgeId, nameOnlyPledgeId, privatePledgeId);

  console.log("--- pledging does not require group membership ---");
  const membershipRes = await rest(
    `group_members?group_id=eq.${groupId}&user_id=eq.${pubPledger.userId}`,
    organizer.accessToken,
  );
  const membership = await membershipRes.json();
  assert(membership.length === 0, "pledger was never added as a group member");

  console.log("--- outsider views the masked board ---");
  const boardRes = await rpc("get_pledge_board", outsider.accessToken, {
    p_group_id: groupId,
  });
  const board = await boardRes.json();
  const pubRow = board.find((r) => r.pledge_id === pubPledgeId);
  const nameOnlyRow = board.find((r) => r.pledge_id === nameOnlyPledgeId);
  const privateRow = board.find((r) => r.pledge_id === privatePledgeId);
  assert(pubRow.display_name !== null && pubRow.display_amount === 30000, "public tier shows name + amount to outsider");
  assert(nameOnlyRow.display_name !== null && nameOnlyRow.display_amount === null, "name_only tier hides amount from outsider");
  assert(privateRow.display_name === null && privateRow.display_amount === null, "private tier hides both from outsider");

  console.log("--- organizer (admin) sees everything regardless of tier ---");
  const adminBoardRes = await rpc("get_pledge_board", organizer.accessToken, {
    p_group_id: groupId,
  });
  const adminBoard = await adminBoardRes.json();
  const privateRowAsAdmin = adminBoard.find((r) => r.pledge_id === privatePledgeId);
  assert(privateRowAsAdmin.display_amount === 10000, "admin sees the private pledge's real amount");

  console.log("--- total is accurate even though some amounts are masked ---");
  const totalRes = await rpc("get_pledge_total", outsider.accessToken, { p_group_id: groupId });
  const total = await totalRes.json();
  assert(Number(total) === 60000, "total reflects all non-cancelled pledges (30000+20000+10000)");

  console.log("--- organizer (as the private pledger) cancels before paying ---");
  const cancelRes = await rpc("cancel_pledge", organizer.accessToken, { p_pledge_id: privatePledgeId });
  assert(cancelRes.status < 300, "cancel succeeds while still pledged");

  const boardAfterCancelRes = await rpc("get_pledge_board", outsider.accessToken, { p_group_id: groupId });
  const boardAfterCancel = await boardAfterCancelRes.json();
  assert(!boardAfterCancel.some((r) => r.pledge_id === privatePledgeId), "cancelled pledge no longer on the board");

  const totalAfterCancelRes = await rpc("get_pledge_total", outsider.accessToken, { p_group_id: groupId });
  const totalAfterCancel = await totalAfterCancelRes.json();
  assert(Number(totalAfterCancel) === 50000, "total excludes the cancelled pledge (30000+20000)");

  console.log("--- pubPledger and nameOnlyPledger submit proof, organizer confirms ---");
  for (const [pledger, pledgeId] of [
    [pubPledger, pubPledgeId],
    [nameOnlyPledger, nameOnlyPledgeId],
  ]) {
    const path = `${pledgeId}/test.png`;
    await fetch(`${BASE}/storage/v1/object/pledge-proofs/${path}`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${pledger.accessToken}`,
        "Content-Type": "image/png",
      },
      body: TINY_PNG,
    });
    await rpc("submit_pledge_proof", pledger.accessToken, {
      p_pledge_id: pledgeId,
      p_transaction_id: "PLEDGE-TXN",
      p_screenshot_path: path,
    });
    const confirmRes = await rpc("confirm_pledge", organizer.accessToken, { p_pledge_id: pledgeId });
    assert(confirmRes.status < 300, `pledge ${pledgeId} confirmed`);
  }

  console.log("--- organizer requests the event payout ---");
  const payoutRes = await rpc("request_event_payout", organizer.accessToken, { p_group_id: groupId });
  const payoutId = await payoutRes.json();
  console.log(payoutRes.status, payoutId);

  const payoutCheckRes = await rest(`payout_requests?id=eq.${payoutId}&select=*`, organizer.accessToken);
  const [payoutCheck] = await payoutCheckRes.json();
  assert(Number(payoutCheck.amount) === 50000, "payout amount is the sum of confirmed pledges only");
  assert(payoutCheck.event_group_id === groupId, "payout references the event group, not a cycle");
  assert(payoutCheck.cycle_id === null, "cycle_id correctly null for an event payout");
  assert(payoutCheck.recipient_user_id === organizer.userId, "recipient is the group's creator/organizer");

  console.log("--- approve_payout (unmodified from Phase 3) works on an event payout ---");
  const approveRes = await rpc("approve_payout", organizer.accessToken, { p_payout_request_id: payoutId });
  assert(approveRes.status < 300, "approve succeeds");
  const approvedCheckRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, organizer.accessToken);
  const [approvedCheck] = await approvedCheckRes.json();
  assert(approvedCheck.status === "approved", "threshold '1' met with a single approval, as for cycle payouts");

  console.log("--- complete_payout (unmodified from Phase 3) works on an event payout ---");
  const proofPath = `${payoutId}/test.png`;
  await fetch(`${BASE}/storage/v1/object/payout-proofs/${proofPath}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${organizer.accessToken}`,
      "Content-Type": "image/png",
    },
    body: TINY_PNG,
  });
  const completeRes = await rpc("complete_payout", organizer.accessToken, {
    p_payout_request_id: payoutId,
    p_transaction_id: "EVENT-PAYOUT-TXN",
    p_screenshot_path: proofPath,
  });
  assert(completeRes.status < 300, "complete succeeds");
  const finalRes = await rest(`payout_requests?id=eq.${payoutId}&select=status`, organizer.accessToken);
  const [final] = await finalRes.json();
  assert(final.status === "completed", "event payout marked completed");

  console.log("--- Cleanup ---");
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await adminClient.storage.from("pledge-proofs").remove([`${pubPledgeId}/test.png`, `${nameOnlyPledgeId}/test.png`]);
  await adminClient.storage.from("payout-proofs").remove([proofPath]);
  await adminClient.from("groups").delete().eq("id", groupId);
  await adminClient.auth.admin.deleteUser(organizer.userId);
  await adminClient.auth.admin.deleteUser(pubPledger.userId);
  await adminClient.auth.admin.deleteUser(nameOnlyPledger.userId);
  await adminClient.auth.admin.deleteUser(outsider.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
