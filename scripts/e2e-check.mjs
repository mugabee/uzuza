// Repeatable Phase 1 regression check: login -> verify -> profile -> group
// creation, run against the real deployed backend. Uses the fixed test
// phone number registered in Supabase's sms_test_otp config (only active
// while that's set — see supabase.com/dashboard > Authentication > Sign In
// / Providers > Phone > Test Phone Numbers and OTPs). Cleans up after itself.
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_PHONE = "+250788000111";
const TEST_OTP = "123456";

async function main() {
  console.log("--- 1. Request OTP ---");
  const otpRes = await fetch(`${BASE}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone: TEST_PHONE }),
  });
  console.log(otpRes.status, await otpRes.text());

  console.log("--- 2. Verify OTP ---");
  const verifyRes = await fetch(`${BASE}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone: TEST_PHONE, token: TEST_OTP, type: "sms" }),
  });
  const verifyData = await verifyRes.json();
  const accessToken = verifyData.access_token;
  const userId = verifyData.user?.id;
  console.log("status:", verifyRes.status, "user id:", userId);

  console.log("--- 3. Check auto-created profile ---");
  const profileRes = await fetch(
    `${BASE}/rest/v1/profiles?id=eq.${userId}&select=*`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` } },
  );
  console.log(profileRes.status, await profileRes.text());

  console.log("--- 4. Update profile ---");
  const updateRes = await fetch(`${BASE}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ full_name: "E2E Check User", phone: TEST_PHONE }),
  });
  console.log(updateRes.status, await updateRes.text());

  console.log("--- 5. Create a group via RPC ---");
  const createRes = await fetch(`${BASE}/rest/v1/rpc/create_group`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_name: "E2E Check Group",
      p_group_type: "rotating",
      p_contribution_amount: 25000,
      p_frequency: "monthly",
      p_target_size: 10,
      p_account_type: "group_owned",
      p_rotation_method: "random",
      p_approval_threshold: "1",
    }),
  });
  const groupId = await createRes.json();
  console.log(createRes.status, groupId);

  console.log("--- 6. Fetch the created group (RLS-protected read) ---");
  const groupRes = await fetch(
    `${BASE}/rest/v1/groups?id=eq.${groupId}&select=*`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` } },
  );
  console.log(groupRes.status, await groupRes.text());

  console.log("--- 7. Fetch group_members row ---");
  const memberRes = await fetch(
    `${BASE}/rest/v1/group_members?group_id=eq.${groupId}&select=*`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` } },
  );
  console.log(memberRes.status, await memberRes.text());

  console.log("--- 8. Cleanup (admin) ---");
  const admin = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await admin.from("groups").delete().eq("created_by", userId);
  await admin.auth.admin.deleteUser(userId);
  console.log("cleaned up test user and group.");
}

main();
