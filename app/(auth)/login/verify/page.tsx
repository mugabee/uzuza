"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { otpCodeSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

export default function VerifyPage() {
  const router = useRouter();
  const [method, setMethod] = useState<"phone" | "email" | null>(null);
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [intent, setIntent] = useState<"signin" | "signup" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const m = sessionStorage.getItem("uzuza_login_method") as
      | "phone"
      | "email"
      | null;
    const id = sessionStorage.getItem("uzuza_login_identifier");
    const i = sessionStorage.getItem("uzuza_login_intent") as
      | "signin"
      | "signup"
      | null;
    if (!m || !id) {
      router.replace("/login");
      return;
    }
    setMethod(m);
    setIdentifier(id);
    setIntent(i ?? "signup");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const result = otpCodeSchema.safeParse(code);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    if (!method || !identifier) return;

    setLoading(true);
    const supabase = createClient();
    const { error: verifyError } =
      method === "phone"
        ? await supabase.auth.verifyOtp({
            phone: identifier,
            token: result.data,
            type: "sms",
          })
        : await supabase.auth.verifyOtp({
            email: identifier,
            token: result.data,
            type: "email",
          });
    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    sessionStorage.removeItem("uzuza_login_method");
    sessionStorage.removeItem("uzuza_login_identifier");
    sessionStorage.removeItem("uzuza_login_intent");
    router.push("/profile");
    // Soft navigations reuse the already-rendered root layout, which
    // read the (until now) signed-out session — refresh so it re-checks
    // auth and the nav shows up immediately, not after the next hard load.
    router.refresh();
  }

  async function handleResend() {
    if (!method || !identifier) return;
    setResending(true);
    setError(null);
    const supabase = createClient();
    const shouldCreateUser = intent === "signup";
    const { error: otpError } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({
            phone: identifier,
            options: { shouldCreateUser },
          })
        : await supabase.auth.signInWithOtp({
            email: identifier,
            options: { shouldCreateUser },
          });
    setResending(false);
    if (otpError) setError(otpError.message);
  }

  if (!method || !identifier) return null;

  const tryDifferentMethod = () => {
    sessionStorage.removeItem("uzuza_login_method");
    sessionStorage.removeItem("uzuza_login_identifier");
    sessionStorage.removeItem("uzuza_login_intent");
    router.push("/login");
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-primary">
          {intent === "signup" ? "Confirm your account" : "Enter your code"}
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          We sent a {intent === "signup" ? "sign-up" : "sign-in"} code to{" "}
          <span className="font-medium text-foreground">{identifier}</span>.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field
            label="Verification code"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify and continue"}
          </Button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            {resending ? "Resending..." : "Resend code"}
          </button>
          <button
            type="button"
            onClick={tryDifferentMethod}
            className="text-sm text-foreground/60 underline-offset-2 hover:underline"
          >
            Didn't get a code? Try a different method
          </button>
        </form>
      </Card>
    </main>
  );
}
