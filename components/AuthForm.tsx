"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import { internationalPhoneSchema, emailSchema } from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";

type Method = "phone" | "email";
type Intent = "signin" | "signup";

/**
 * Shared logic + UI for both /login and /signup — the two pages are
 * genuinely separate routes with their own heading/copy/entry point
 * (no combined toggle anymore), but the actual OTP-sending flow is
 * identical apart from `shouldCreateUser`, so it lives here once
 * rather than duplicated across two page files.
 */
export function AuthForm({ intent, redirectTo }: { intent: Intent; redirectTo: string | null }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const otherIntentHref =
    (intent === "signin" ? "/signup" : "/login") +
    (redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const schema = method === "phone" ? internationalPhoneSchema : emailSchema;
    const result = schema.safeParse(method === "phone" ? phone : email);
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
      if (otpError.code === "otp_disabled" && intent === "signin") {
        setError("No account found for this number/email — create one instead.");
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
    <Card className="max-w-sm">
      <h1 className="font-display text-2xl font-semibold text-primary">
        {intent === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-foreground/70">
        {intent === "signup"
          ? "Join Uzuza to start or join a savings group."
          : "Sign in to your Uzuza account."}
      </p>

      <div className="mt-5 flex gap-1 rounded-full bg-surface-secondary p-1 text-sm font-medium">
        {(["phone", "email"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMethod(m);
              setError(null);
            }}
            className={`flex-1 rounded-full py-2 capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              method === m
                ? "bg-surface text-primary shadow-[var(--shadow-soft)]"
                : "text-foreground/60 hover:text-foreground/80"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        {method === "phone" ? (
          <CountryPhoneInput value={phone} onChange={setPhone} error={error ?? undefined} />
        ) : (
          <Field
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ?? undefined}
            autoFocus
          />
        )}
        <Button type="submit" disabled={loading} loading={loading}>
          {loading
            ? "Sending..."
            : intent === "signup"
              ? "Send sign-up code"
              : "Send sign-in code"}
        </Button>
      </form>

      <Link
        href={otherIntentHref}
        className="mt-4 block text-center text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        {intent === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </Link>
    </Card>
  );
}
