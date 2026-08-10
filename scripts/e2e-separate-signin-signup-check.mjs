// Regression check for separated sign-in vs sign-up: a "sign in" attempt
// for a phone number with no existing account must fail cleanly
// (shouldCreateUser: false -> otp_disabled), a "sign up" attempt for the
// same number must succeed and create the account, and a subsequent
// "sign in" attempt for that now-existing account must succeed too.
import { createClient } from "@supabase/supabase-js";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_OTP = "123456";
const PHONE = "+250788007111";

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log("  ok:", msg);
}

async function main() {
  const supabase = createClient(BASE, ANON_KEY);

  console.log("--- 1. Sign in to a phone with no account: must fail cleanly ---");
  const signInBeforeSignup = await supabase.auth.signInWithOtp({
    phone: PHONE,
    options: { shouldCreateUser: false },
  });
  assert(!!signInBeforeSignup.error, "sign-in attempt returned an error");
  assert(signInBeforeSignup.error.code === "otp_disabled", "error code is otp_disabled");
  console.log("  error message:", signInBeforeSignup.error.message);

  console.log("\n--- 2. Sign up with the same number: must succeed ---");
  const signUp = await supabase.auth.signInWithOtp({
    phone: PHONE,
    options: { shouldCreateUser: true },
  });
  assert(!signUp.error, "sign-up OTP request succeeded");

  const verifyRes = await supabase.auth.verifyOtp({
    phone: PHONE,
    token: TEST_OTP,
    type: "sms",
  });
  assert(!verifyRes.error, "OTP verification succeeded, account created");
  const userId = verifyRes.data.user?.id;
  console.log("  created user:", userId);

  await supabase.auth.signOut();

  console.log("\n--- 3. Sign in with the now-existing account: must succeed ---");
  console.log("  (short pause to clear Supabase's per-identifier OTP rate limit)");
  await new Promise((r) => setTimeout(r, 15000));
  const signInAfterSignup = await supabase.auth.signInWithOtp({
    phone: PHONE,
    options: { shouldCreateUser: false },
  });
  if (signInAfterSignup.error) {
    console.log("  error:", JSON.stringify(signInAfterSignup.error));
  }
  assert(!signInAfterSignup.error, "sign-in attempt now succeeds for an existing account");

  console.log("\n--- cleanup ---");
  const adminClient = createClient(BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (userId) {
    await adminClient.auth.admin.deleteUser(userId).catch((e) =>
      console.log("cleanup user delete failed", userId, e.message),
    );
  }

  console.log("\nAll separated sign-in/sign-up checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
