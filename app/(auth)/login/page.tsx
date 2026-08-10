"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { phoneSchema, emailSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

type Method = "phone" | "email";

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("phone");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const schema = method === "phone" ? phoneSchema : emailSchema;
    const result = schema.safeParse(identifier);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: otpError } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone: result.data })
        : await supabase.auth.signInWithOtp({ email: result.data });
    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    // Kept out of the URL since phone/email are PII — sessionStorage instead
    // of a query param.
    sessionStorage.setItem("uzuza_login_method", method);
    sessionStorage.setItem("uzuza_login_identifier", result.data);
    router.push("/login/verify");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Welcome to Uzuza
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          Sign in with your phone or email to continue.
        </p>

        <div className="mt-6 flex gap-1 rounded-full bg-black/[0.04] p-1 text-sm font-medium">
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

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
          <Button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send verification code"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
