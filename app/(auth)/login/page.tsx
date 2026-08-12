"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { phoneSchema, emailSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

type Method = "phone" | "email";
type Intent = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [method, setMethod] = useState<Method>("phone");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!intent) return;

    const schema = method === "phone" ? phoneSchema : emailSchema;
    const result = schema.safeParse(identifier);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const shouldCreateUser = intent === "signup";
    const { error: otpError } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({
            phone: result.data,
            options: { shouldCreateUser },
          })
        : await supabase.auth.signInWithOtp({
            email: result.data,
            options: { shouldCreateUser },
          });
    setLoading(false);

    if (otpError) {
      if (otpError.code === "otp_disabled") {
        setError(
          "No account found for this number/email — switch to Create Account below.",
        );
        return;
      }
      setError(otpError.message);
      return;
    }

    // Kept out of the URL since phone/email are PII — sessionStorage instead
    // of a query param.
    sessionStorage.setItem("uzuza_login_method", method);
    sessionStorage.setItem("uzuza_login_identifier", result.data);
    sessionStorage.setItem("uzuza_login_intent", intent);
    if (redirectTo) {
      sessionStorage.setItem("uzuza_login_redirect", redirectTo);
    }
    router.push("/login/verify");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Welcome to Uzuza
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          {intent === "signup"
            ? "Create your account to get started."
            : intent === "signin"
              ? "Sign in to your existing account."
              : "Do you already have an account?"}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setIntent("signin");
              setError(null);
            }}
            className={`rounded-xl border px-3 py-3 text-center text-sm font-semibold transition-all duration-150 ${
              intent === "signin"
                ? "border-primary bg-primary/5 text-primary shadow-[var(--shadow-soft)]"
                : "border-black/10 text-foreground/70 hover:border-black/20"
            }`}
          >
            Sign In
            <span className="mt-0.5 block text-xs font-normal text-foreground/50">
              I have an account
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIntent("signup");
              setError(null);
            }}
            className={`rounded-xl border px-3 py-3 text-center text-sm font-semibold transition-all duration-150 ${
              intent === "signup"
                ? "border-primary bg-primary/5 text-primary shadow-[var(--shadow-soft)]"
                : "border-black/10 text-foreground/70 hover:border-black/20"
            }`}
          >
            Create Account
            <span className="mt-0.5 block text-xs font-normal text-foreground/50">
              I'm new here
            </span>
          </button>
        </div>

        {intent && (
          <>
            <div className="mt-5 flex gap-1 rounded-full bg-black/[0.04] p-1 text-sm font-medium">
              {(["phone", "email"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethod(m);
                    setIdentifier("");
                    setError(null);
                  }}
                  className={`flex-1 rounded-full py-2 capitalize transition-all duration-200 ${
                    method === m
                      ? "bg-white text-primary shadow-[var(--shadow-soft)]"
                      : "text-foreground/60 hover:text-foreground/80"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <Field
                label={method === "phone" ? "Phone number" : "Email address"}
                type={method === "phone" ? "tel" : "email"}
                placeholder={method === "phone" ? "+250788123456" : "you@example.com"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                error={error ?? undefined}
                autoFocus
              />
              {method === "phone" && !error && (
                <p className="-mt-2 text-xs text-foreground/40">
                  🇷🇼 Rwanda (+250) or 🇺🇬 Uganda (+256) numbers
                </p>
              )}
              <Button type="submit" disabled={loading}
            loading={loading}>
                {loading
                  ? "Sending..."
                  : intent === "signup"
                    ? "Send sign-up code"
                    : "Send sign-in code"}
              </Button>
              {error?.includes("Create Account") && (
                <button
                  type="button"
                  onClick={() => {
                    setIntent("signup");
                    setError(null);
                  }}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Switch to Create Account →
                </button>
              )}
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
