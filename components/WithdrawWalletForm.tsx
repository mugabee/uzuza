"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { phoneSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { friendlyError } from "@/lib/friendly-error";

const withdrawSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  phone: phoneSchema,
});
type WithdrawInput = z.infer<typeof withdrawSchema>;

export function WithdrawWalletForm({
  balance,
  defaultPhone,
  onWithdrawn,
}: {
  balance: number;
  defaultPhone: string;
  onWithdrawn: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WithdrawInput>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { phone: defaultPhone },
  });

  async function onSubmit(values: WithdrawInput) {
    setError(null);
    if (values.amount > balance) {
      setError("That's more than your current wallet balance.");
      return;
    }
    const res = await fetch("/api/momo/disbursements/wallet-withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(friendlyError(data.error ?? "Could not complete the withdrawal"));
      return;
    }
    setDone(true);
    onWithdrawn();
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-primary/5 p-5 text-center">
        <p className="text-2xl">✓</p>
        <p className="mt-2 font-semibold text-primary">Withdrawal sent!</p>
        <p className="mt-1 text-sm text-foreground/60">Your wallet balance has been updated.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-4 py-2.5 text-sm">
        <span className="text-foreground/60">Available balance</span>
        <span className="font-semibold text-foreground">{balance.toLocaleString()} RWF</span>
      </div>
      <Field label="Amount (RWF)" type="number" error={errors.amount?.message} {...register("amount")} />
      <Field
        label="Send to this MoMo phone number"
        type="tel"
        placeholder="+250788123456"
        error={errors.phone?.message}
        {...register("phone")}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
        {isSubmitting ? "Sending..." : "Withdraw"}
      </Button>
      <p className="text-center text-xs text-foreground/40">
        Requires a verified second factor on your account — enroll at Settings first if you
        haven't already.
      </p>
    </form>
  );
}
