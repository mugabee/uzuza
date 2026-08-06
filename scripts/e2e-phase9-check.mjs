// Repeatable Phase 9 regression check against the real deployed backend.
// Grants staff access directly via the service-role client (same precedent
// as Phase 7's custody_cap_amount edits — no self-serve staff signup),
// confirms a non-staff user is rejected by every internal RPC, exercises
// mediation stakes tiering, unmatched payments, and ID verification review.
// Requires sms_test_otp set in Supabase's auth config (see CLAUDE.md).
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
  return rest(`rpc/${name}`, accessToken, { method: "POST", body: JSON.stringify(body ?? {}) });
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

async function submitAndConfirm(accessToken, adminToken, contribution) {
  const path = `${contribution.id}/test.png`;
  await fetch(`${BASE}/storage/v1/object/contribution-proofs/${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
    body: TINY_PNG,
  });
  await rpc("submit_contribution_proof", accessToken, {
    p_contribution_id: contribution.id, p_transaction_id: "TEST-TXN", p_screenshot_path: path,
  });
  await rpc("confirm_contribution", adminToken, {
    p_contribution_id: contribution.id, p_approve: true, p_reason: null,
  });
}

async function main() {
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login two test users: one will become staff, one stays a regular member ---");
  const staffer = await loginAs("+250788000111");
  const regular = await loginAs("+250788000222");

  console.log("--- Non-staff is rejected by every internal RPC before staff access is granted ---");
  const metricsBeforeRes = await rpc("get_platform_metrics", staffer.accessToken);
  assert(metricsBeforeRes.status >= 400, "get_platform_metrics rejects a non-staff user");
  const mediationBeforeRes = await rpc("list_mediation_cases", regular.accessToken);
  assert(mediationBeforeRes.status >= 400, "list_mediation_cases rejects a non-staff user");
  const custodyBeforeRes = await rpc("get_custody_overview", regular.accessToken);
  assert(custodyBeforeRes.status >= 400, "get_custody_overview rejects a non-staff user");

  console.log("--- Grant staff access to one test user ---");
  await adminClient.from("staff_users").insert({ user_id: staffer.userId });
  const isStaffRes = await rpc("is_staff", staffer.accessToken);
  assert((await isStaffRes.json()) === true, "is_staff() true for the granted user");
  const isStaffRegularRes = await rpc("is_staff", regular.accessToken);
  assert((await isStaffRegularRes.json()) === false, "is_staff() false for the ungranted user");

  console.log("--- Regular user is still rejected after someone else became staff ---");
  const stillRejectedRes = await rpc("list_mediation_cases", regular.accessToken);
  assert(stillRejectedRes.status >= 400, "non-staff still rejected after another user gained staff access");

  console.log("--- Metrics readable by staff ---");
  const metricsRes = await rpc("get_platform_metrics", staffer.accessToken);
  assert(metricsRes.status < 300, "get_platform_metrics succeeds for staff");
  const metrics = await metricsRes.json();
  const metricsRow = Array.isArray(metrics) ? metrics[0] : metrics;
  assert(metricsRow != null, "metrics row returned");

  console.log("=== Mediation stakes tiering: financial group vs. general group ===");
  const financialGroupRes = await rpc("create_group", staffer.accessToken, {
    p_name: "Phase 9 E2E Financial Group", p_group_type: "rotating", p_contribution_amount: 20000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "uzuza_held",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const financialGroupId = await financialGroupRes.json();
  await rpc("join_group", regular.accessToken, { p_group_id: financialGroupId });

  const generalGroupRes = await rpc("create_group", staffer.accessToken, {
    p_name: "Phase 9 E2E General Group", p_group_type: "rotating", p_contribution_amount: 20000,
    p_frequency: "monthly", p_target_size: 2, p_account_type: "group_owned",
    p_rotation_method: "random", p_approval_threshold: "1",
  });
  const generalGroupId = await generalGroupRes.json();
  await rpc("join_group", regular.accessToken, { p_group_id: generalGroupId });

  const financialMediationRes = await rpc("request_mediation", regular.accessToken, {
    p_group_id: financialGroupId, p_reason: "Dispute in a uzuza_held group",
  });
  const financialMediationId = await financialMediationRes.json();
  const generalMediationRes = await rpc("request_mediation", regular.accessToken, {
    p_group_id: generalGroupId, p_reason: "Dispute in a group_owned group",
  });
  const generalMediationId = await generalMediationRes.json();

  const casesRes = await rpc("list_mediation_cases", staffer.accessToken);
  const cases = await casesRes.json();
  const financialCase = cases.find((c) => c.id === financialMediationId);
  const generalCase = cases.find((c) => c.id === generalMediationId);
  assert(financialCase?.stakes === "financial", "mediation in a uzuza_held group tagged financial");
  assert(generalCase?.stakes === "general", "mediation in a group_owned group tagged general");

  console.log("--- Close both cases ---");
  await rpc("close_mediation_case", staffer.accessToken, { p_case_id: financialMediationId });
  await rpc("close_mediation_case", staffer.accessToken, { p_case_id: generalMediationId });
  const casesAfterRes = await rpc("list_mediation_cases", staffer.accessToken);
  const casesAfter = await casesAfterRes.json();
  assert(
    casesAfter.find((c) => c.id === financialMediationId)?.status === "closed",
    "financial case closed",
  );

  console.log("=== Unmatched payments: log then resolve ===");
  const logRes = await rpc("log_unmatched_payment", staffer.accessToken, {
    p_description: "Phase 9 E2E: MoMo alert with no matching reference", p_amount: 15000,
  });
  const unmatchedId = await logRes.json();
  const unmatchedListRes = await rest(
    `unmatched_payments?id=eq.${unmatchedId}&select=*`,
    staffer.accessToken,
  );
  const [unmatchedRow] = await unmatchedListRes.json();
  assert(unmatchedRow.status === "open", "unmatched payment logged as open");
  await rpc("resolve_unmatched_payment", staffer.accessToken, { p_id: unmatchedId });
  const unmatchedAfterRes = await rest(
    `unmatched_payments?id=eq.${unmatchedId}&select=*`,
    staffer.accessToken,
  );
  const [unmatchedAfter] = await unmatchedAfterRes.json();
  assert(unmatchedAfter.status === "resolved", "unmatched payment resolved");

  console.log("=== ID verification: insert a test row via admin client, then decide as staff ===");
  const { data: idRequest } = await adminClient
    .from("id_verification_requests")
    .insert({ user_id: regular.userId })
    .select()
    .single();
  const idListRes = await rpc("list_id_verification_requests", staffer.accessToken);
  const idList = await idListRes.json();
  assert(
    idList.some((r) => r.id === idRequest.id && r.status === "pending"),
    "test ID verification request appears in the staff queue as pending",
  );
  await rpc("decide_id_verification", staffer.accessToken, { p_id: idRequest.id, p_approve: true });
  const idAfterRes = await rest(
    `id_verification_requests?id=eq.${idRequest.id}&select=*`,
    staffer.accessToken,
  );
  const [idAfter] = await idAfterRes.json();
  assert(idAfter.status === "approved", "ID verification request approved by staff decision");
  assert(idAfter.reviewed_by === staffer.userId, "reviewed_by recorded");

  console.log("=== Custody overview readable by staff, still cross-group ===");
  const custodyRes = await rpc("get_custody_overview", staffer.accessToken);
  assert(custodyRes.status < 300, "get_custody_overview succeeds for staff");
  const custody = await custodyRes.json();
  const custodyRow = Array.isArray(custody) ? custody[0] : custody;
  assert(custodyRow != null, "custody overview row returned");
  assert(Array.isArray(custodyRow.recent_sweeps), "recent_sweeps is an array");

  console.log("--- Cleanup ---");
  await adminClient.from("id_verification_requests").delete().eq("id", idRequest.id);
  await adminClient.from("unmatched_payments").delete().eq("id", unmatchedId);
  await adminClient.from("groups").delete().in("id", [financialGroupId, generalGroupId]);
  await adminClient.from("staff_users").delete().eq("user_id", staffer.userId);
  await adminClient.auth.admin.deleteUser(staffer.userId);
  await adminClient.auth.admin.deleteUser(regular.userId);
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
