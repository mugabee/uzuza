"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { phoneSchema } from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { friendlyError } from "../lib/friendly-error";

const directPledgeSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  phone: phoneSchema,
  visibility: z.enum(["public", "name_only", "private"]),
});
type DirectPledgeInput = z.infer<typeof directPledgeSchema>;

type Stage = "form" | "waiting" | "confirmed" | "failed";

export function DirectMomoPledgeForm({
  groupId,
  suggestedAmount,
}: {
  groupId: string;
  suggestedAmount: number;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DirectPledgeInput>({
    resolver: zodResolver(directPledgeSchema),
    defaultValues: { amount: suggestedAmount || undefined, visibility: "public" },
  });

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function onSubmit(values: DirectPledgeInput) {
    setError(null);
    const res = await fetch("/api/momo/collections/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, ...values }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(friendlyError(data.error ?? "Could not start the payment request"));
      return;
    }

    setStage("waiting");
    const { pledgeId, referenceId } = data;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const statusRes = await fetch("/api/momo/collections/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pledgeId, referenceId }),
        });
        const statusData = await statusRes.json();
        if (statusData.status === "confirmed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage("confirmed");
        } else if (statusData.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage("failed");
        }
      } catch {
        // transient network hiccup — keep polling
      }
      if (attempts >= 40 && pollRef.current) {
        // ~2 minutes at 3s intervals
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
      <Field
        label="Amount (RWF)"
        type="number"
        error={errors.amount?.message}
        {...register("amount")}
      />
      <Field
        label="Your MoMo phone number"
        type="tel"
        placeholder="+250788123456"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Visibility</span>
        <select
          className="rounded-lg border border-border px-4 py-2.5 outline-none focus:border-primary"
          {...register("visibility")}
        >
          <option value="public">Public — name and amount visible</option>
          <option value="name_only">Name only — amount hidden</option>
          <option value="private">Private — nothing shown</option>
        </select>
      </label>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
        {isSubmitting ? "Starting..." : "Pay with MTN MoMo"}
      </Button>
      <p className="text-center text-xs text-foreground/40">
        You'll get a payment prompt on your phone — no account needed.
      </p>
    </form>
  );
}
