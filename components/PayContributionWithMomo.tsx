"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { phoneSchema } from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { friendlyError } from "../lib/friendly-error";

const payContributionSchema = z.object({ phone: phoneSchema });
type PayContributionInput = z.infer<typeof payContributionSchema>;

type Stage = "form" | "waiting" | "confirmed" | "failed";

export function PayContributionWithMomo({
  contributionId,
  amount,
  defaultPhone,
  onConfirmed,
}: {
  contributionId: string;
  amount: number;
  defaultPhone: string;
  onConfirmed: () => void;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PayContributionInput>({
    resolver: zodResolver(payContributionSchema),
    defaultValues: { phone: defaultPhone },
  });

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function onSubmit(values: PayContributionInput) {
    setError(null);
    const res = await fetch("/api/momo/collections/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId, phone: values.phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(friendlyError(data.error ?? "Could not start the payment request"));
      return;
    }

    setStage("waiting");
    const { referenceId } = data;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const statusRes = await fetch("/api/momo/collections/contribute-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contributionId, referenceId }),
        });
        const statusData = await statusRes.json();
        if (statusData.status === "confirmed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage("confirmed");
          onConfirmed();
        } else if (statusData.status === "cancelled") {
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

  if (stage === "confirmed") {
    return (
      <div className="rounded-2xl bg-primary/5 p-5 text-center">
        <p className="text-2xl">✓</p>
        <p className="mt-2 font-semibold text-primary">Thank you — payment confirmed!</p>
        <p className="mt-1 text-sm text-foreground/60">
          Your contribution has been received and recorded automatically.
        </p>
      </div>
    );
  }

  if (stage === "waiting") {
    return (
      <div className="rounded-2xl bg-accent/5 p-5 text-center">
        <svg
          className="mx-auto h-8 w-8 animate-spin text-accent"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="mt-3 font-semibold text-foreground">Check your phone</p>
        <p className="mt-1 text-sm text-foreground/60">
          A payment prompt was sent to your number. Enter your MoMo PIN there to
          complete your contribution — this page will update automatically.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      {stage === "failed" && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-xs text-danger">
          The payment wasn't completed — declined, timed out, or something went
          wrong. You can try again below.
        </p>
      )}
      <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 text-sm">
        <span className="text-foreground/60">Amount</span>
        <span className="font-semibold text-foreground">{amount.toLocaleString()} RWF</span>
      </div>
      <Field
        label="Your MoMo phone number"
        type="tel"
        placeholder="+250788123456"
        error={errors.phone?.message}
        {...register("phone")}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
        {isSubmitting ? "Starting..." : "Pay with MTN MoMo"}
      </Button>
      <p className="text-center text-xs text-foreground/40">
        You'll get a payment prompt on your phone — no screenshot needed.
      </p>
    </form>
  );
}
