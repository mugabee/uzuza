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
    if (!m || !id) {
      router.replace("/login");
      return;
    }
    setMethod(m);
    setIdentifier(id);
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
    router.push("/profile");
  }

  async function handleResend() {
    if (!method || !identifier) return;
    setResending(true);
    setError(null);
    const supabase = createClient();
    const { error: otpError } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone: identifier })
        : await supabase.auth.signInWithOtp({
            email: identifier,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
    setResending(false);
    if (otpError) setError(otpError.message);
  }

  if (!method || !identifier) return null;

  const tryDifferentMethod = () => {
    sessionStorage.removeItem("uzuza_login_method");
    sessionStorage.removeItem("uzuza_login_identifier");
    router.push("/login");
  };

  if (method === "email") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Card className="max-w-sm">
          <h1 className="font-display text-2xl font-semibold text-primary">
            Check your email
          </h1>
          <p className="mt-1 text-sm text-foreground/70">
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground">{identifier}</span>.
            Open it on this device to continue — it'll bring you straight
            back here, signed in.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
            >
              {resending ? "Resending..." : "Resend link"}
            </button>
            <button
              type="button"
              onClick={tryDifferentMethod}
              className="text-sm text-foreground/60 underline-offset-2 hover:underline"
            >
              Didn't get it? Try a different method
            </button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Enter your code
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          We sent a 6-digit code to{" "}
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
