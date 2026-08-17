// Verifies the staff-configurable withdrawal verification controls
// (None / MFA / Full KYC / Both), global default + per-user override,
// and confirms the fix for the real lockout bug this migration closes:
// request_wallet_withdrawal used to unconditionally require a verified
// TOTP factor, which nobody can actually enroll today (a documented,
// pre-existing GoTrue infra bug) — so with the new 'none' global
// default, a real withdrawal request must now succeed without MFA.
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
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("--- Login a staff user and a regular member ---");
  const staff = await loginAs("+250788000333");
  const member = await loginAs("+250788000444");
  await adminClient.from("staff_users").insert({ user_id: staff.userId });
  await adminClient.from("profiles").update({ full_name: "Withdrawal Controls Test Member" }).eq("id", member.userId);

  console.log("--- non-staff cannot read or change withdrawal settings ---");
  const nonStaffReadRes = await rpc("get_withdrawal_verification_settings", member.accessToken, {});
  assert(!nonStaffReadRes.ok, "non-staff blocked from reading withdrawal settings");
  const nonStaffWriteRes = await rpc("set_global_withdrawal_requirement", member.accessToken, { p_requirement: "kyc" });
  assert(!nonStaffWriteRes.ok, "non-staff blocked from changing the global requirement");

  console.log("--- current global default is 'none' (the lockout fix) ---");
  const settingsRes = await rpc("get_withdrawal_verification_settings", staff.accessToken, {});
  const [settings] = await settingsRes.json();
  console.log(`  global requirement: ${settings.global_requirement}`);
  assert(settings.global_requirement === "none", "global default is 'none', not the old unconditional MFA requirement");

  console.log("--- give the member a wallet balance and confirm a real withdrawal succeeds with NO MFA enrolled ---");
  const { data: topupRow } = await adminClient.from("wallet_transactions").insert({
    user_id: member.userId, type: "topup", amount: 10000, status: "pending", phone: "+250788000444",
  }).select("id").single();
  await adminClient.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", topupRow.id);

  const withdrawRes = await rpc("request_wallet_withdrawal", member.accessToken, { p_amount: 5000, p_phone: "+250788000444" });
  const withdrawBody = withdrawRes.ok ? await withdrawRes.json() : await withdrawRes.json();
  assert(withdrawRes.ok, `withdrawal request succeeds without MFA under the 'none' default (got: ${JSON.stringify(withdrawBody)})`);

  console.log("--- staff sets a per-user override requiring Full KYC for this member ---");
  const overrideRes = await rpc("set_user_withdrawal_requirement_override", staff.accessToken, {
    p_user_id: member.userId, p_requirement: "kyc",
  });
  assert(overrideRes.ok, "staff can set a per-user override");

  const afterOverrideRes = await rpc("get_withdrawal_verification_settings", staff.accessToken, {});
  const [afterOverride] = await afterOverrideRes.json();
  assert(
    afterOverride.overrides.some((o) => o.user_id === member.userId && o.requirement === "kyc"),
    "override shows up in the staff settings view",
  );

  // Exercises the verification check directly (rather than through
  // request_wallet_withdrawal again) so this doesn't collide with that
  // RPC's own 60s rate limit, already consumed by the successful
  // withdrawal above — check_withdrawal_verification_requirement is the
  // exact gate request_wallet_withdrawal calls first, before its own
  // rate-limit check, so this proves the same thing without the collision.
  console.log("--- member (not KYC-verified) is now blocked by the verification gate itself ---");
  const blockedRes = await rpc("check_withdrawal_verification_requirement", member.accessToken, {});
  assert(!blockedRes.ok, "member without identity_verified is blocked once their override requires KYC");

  console.log("--- staff verifies the member's identity directly, now the gate passes ---");
  await adminClient.from("profiles").update({ identity_verified: true, identity_verified_at: new Date().toISOString() }).eq("id", member.userId);
  const afterKycRes = await rpc("check_withdrawal_verification_requirement", member.accessToken, {});
  const afterKycBody = afterKycRes.ok ? null : await afterKycRes.json();
  assert(afterKycRes.ok, `verification gate passes once identity_verified is true, satisfying the KYC override (got: ${JSON.stringify(afterKycBody)})`);

  console.log("--- staff clears the override, effective requirement falls back to the global default ---");
  const clearRes = await rpc("clear_user_withdrawal_requirement_override", staff.accessToken, { p_user_id: member.userId });
  assert(clearRes.ok, "staff can clear the override");
  const finalSettingsRes = await rpc("get_withdrawal_verification_settings", staff.accessToken, {});
  const [finalSettings] = await finalSettingsRes.json();
  assert(!finalSettings.overrides.some((o) => o.user_id === member.userId), "override no longer listed after clearing");

  console.log("--- staff can search for a member by name ---");
  const searchRes = await rpc("search_profiles_for_staff", staff.accessToken, { p_query: "Withdrawal Controls Test Member" });
  const searchResults = await searchRes.json();
  assert(searchResults.some((r) => r.id === member.userId), "staff search finds the member by name");

  console.log("--- Cleanup ---");
  await adminClient.from("withdrawal_verification_overrides").delete().eq("user_id", member.userId);
  await adminClient.from("wallet_transactions").delete().eq("user_id", member.userId);
  await adminClient.from("staff_users").delete().eq("user_id", staff.userId);
  await adminClient.auth.admin.deleteUser(staff.userId);
  await adminClient.auth.admin.deleteUser(member.userId);
  await adminClient.rpc("purge_orphaned_ledger_test_accounts");
  console.log("cleaned up. ALL CHECKS PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
