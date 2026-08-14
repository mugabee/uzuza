"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "../lib/supabase/client";
import { phoneSchema } from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { friendlyError } from "../lib/friendly-error";

const topUpSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  phone: phoneSchema,
});
type TopUpInput = z.infer<typeof topUpSchema>;

type Stage = "consent" | "form" | "waiting" | "confirmed" | "failed";

export function TopUpWalletForm({
  hasConsent,
  defaultPhone,
  onConfirmed,
}: {
  hasConsent: boolean;
  defaultPhone: string;
  onConfirmed: () => void;
}) {
  const [stage, setStage] = useState<Stage>(hasConsent ? "form" : "consent");
  const [error, setError] = useState<string | null>(null);
  const [consenting, setConsenting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TopUpInput>({
    resolver: zodResolver(topUpSchema),
    defaultValues: { phone: defaultPhone },
  });

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleConsent() {
    setConsenting(true);
    const supabase = createClient();
    const { error: consentError } = await supabase.rpc("consent_to_personal_wallet");
    setConsenting(false);
    if (consentError) {
      setError(friendlyError(consentError.message));
      return;
    }
    setStage("form");
  }

  async function onSubmit(values: TopUpInput) {
    setError(null);
    const res = await fetch("/api/momo/collections/wallet-topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(friendlyError(data.error ?? "Could not start the payment request"));
      return;
    }

    setStage("waiting");
    const { transactionId, referenceId } = data;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const statusRes = await fetch("/api/momo/collections/wallet-topup-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId, referenceId }),
        });
        const statusData = await statusRes.json();
        if (statusData.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage("confirmed");
          onConfirmed();
        } else if (statusData.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage("failed");
        }
      } catch {
        // transient network hiccup — keep polling
      }
      if (attempts >= 40 && pollRef.current) {
        clearInterval(pollRef.current);
        setStage("failed");
        setError("This is taking longer than expected. Check your phone, or try again.");
      }
    }, 3000);
  }

  if (stage === "consent") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground/70">
          Topping up means Uzuza holds this money in its own account until you withdraw it —
          there's no group behind a personal wallet deposit. This is a sandboxed feature: no real
          funds move yet, and a platform-wide cap and audit trail apply the same way they do for
          group funds.
        </p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button onClick={handleConsent} disabled={consenting} loading={consenting}>
          {consenting ? "..." : "I understand, continue"}
        </Button>
      </div>
    );
  }

  if (stage === "confirmed") {
    return (
      <div className="rounded-2xl bg-primary/5 p-5 text-center">
        <p className="text-2xl">✓</p>
        <p className="mt-2 font-semibold text-primary">Deposit confirmed!</p>
        <p className="mt-1 text-sm text-foreground/60">Your wallet balance has been updated.</p>
      </div>
    );
  }

  if (stage === "waiting") {
    return (
      <div className="rounded-2xl bg-accent/5 p-5 text-center">
        <svg className="mx-auto h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-3 font-semibold text-foreground">Check your phone</p>
        <p className="mt-1 text-sm text-foreground/60">
          A payment prompt was sent to your number. Enter your MoMo PIN there to complete your
          deposit — this page will update automatically.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      {stage === "failed" && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-xs text-danger">
          The deposit wasn't completed — declined, timed out, or the platform cap was reached.
          You can try again below.
        </p>
      )}
      <Field label="Amount (RWF)" type="number" error={errors.amount?.message} {...register("amount")} />
      <Field
        label="Your MoMo phone number"
        type="tel"
        placeholder="+250788123456"
        error={errors.phone?.message}
        {...register("phone")}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
        {isSubmitting ? "Starting..." : "Top up with MTN MoMo"}
      </Button>
      <p className="text-center text-xs text-foreground/40">
        Airtel Money isn't wired up yet — MTN MoMo only for now.
      </p>
    </form>
  );
}
