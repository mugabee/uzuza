"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "../lib/supabase/client";
import {
  reservationProofSchema,
  type ReservationProofFormInput,
  type ReservationProofInput,
} from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { friendlyError } from "../lib/friendly-error";
import { compressImage } from "../lib/compress-image";
import { ScreenshotPreview } from "@/components/ScreenshotPreview";
import { PaymentChannelPicker } from "@/components/PaymentChannelPicker";

type Group = {
  id: string;
  name: string;
  group_type: "rotating" | "event";
  contribution_amount: number;
  frequency: string;
  target_size: number;
};

const UZUZA_CUSTODY_NUMBER = process.env.NEXT_PUBLIC_UZUZA_CUSTODY_MOMO_NUMBER;

export function ReserveCard({ group }: { group: Group }) {
  const [reservation, setReservation] = useState<{
    id: string;
    feeAmount: number;
    reference: string;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = Math.min(Number(group.contribution_amount) * 0.05, 50000);

  async function handleReserve() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: reservationId, error: rpcError } = await supabase.rpc(
      "reserve_spot",
      { p_group_id: group.id },
    );
    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError.message));
      return;
    }
    const { data: row, error: fetchError } = await supabase
      .from("reservations")
      .select("id, fee_amount, unique_reference")
      .eq("id", reservationId)
      .single();
    setBusy(false);
    if (fetchError || !row) {
      setError(fetchError ? friendlyError(fetchError.message) : "Could not load reservation");
      return;
    }
    setReservation({
      id: row.id,
      feeAmount: Number(row.fee_amount),
      reference: row.unique_reference,
    });
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReservationProofFormInput, unknown, ReservationProofInput>({
    resolver: zodResolver(reservationProofSchema),
    defaultValues: { paymentChannel: "momo_manual", payerCurrency: "RWF" },
  });

  async function onSubmit(values: ReservationProofInput) {
    if (!reservation) return;
    setError(null);
    const supabase = createClient();

    const fileToUpload = await compressImage(values.screenshot);
    const path = `${reservation.id}/${Date.now()}-${values.screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("reservation-proofs")
      .upload(path, fileToUpload);
    if (uploadError) {
      setError(friendlyError(uploadError.message));
      return;
    }

    const fxRate =
      values.paymentChannel !== "momo_manual" && values.payerAmount
        ? reservation.feeAmount / values.payerAmount
        : undefined;

    const { error: rpcError } = await supabase.rpc("submit_reservation_proof", {
      p_reservation_id: reservation.id,
      p_transaction_id: values.transactionId,
      p_screenshot_path: path,
      p_payment_channel: values.paymentChannel,
      p_payer_currency: values.payerCurrency,
      p_payer_amount: values.payerAmount ?? null,
      p_fx_rate_to_rwf: fxRate ?? null,
    });
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card className="max-w-sm text-center">
        <h1 className="font-display text-xl font-semibold text-primary">
          Reservation submitted
        </h1>
        <p className="mt-2 text-sm text-foreground/70">
          Waiting for an admin to confirm your payment. You'll become a full
          member once the group fills and every reservation is confirmed.
        </p>
        <Link href={`/groups/${group.id}`}>
          <Button className="mt-6 w-full">Go to group</Button>
        </Link>
      </Card>
    );
  }

  if (!reservation) {
    return (
      <Card className="max-w-sm">
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          {group.group_type === "rotating" ? "Rotating Savings" : "Event Contribution"}
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>
        <p className="mt-2 text-sm text-foreground/70">
          {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
          {group.frequency}, target {group.target_size} members
        </p>

        <div className="mt-4 rounded-lg bg-surface-secondary p-3 text-xs text-foreground/70">
          Reserving costs a refundable deposit of{" "}
          <strong>{fee.toLocaleString()} RWF</strong> (5% of the contribution
          amount, capped at 50,000 RWF). This deposit is held in Uzuza's own
          account — not the group's — until the group fills, since no group
          account exists yet during formation. It's refunded in full if the
          group never fills, and converts into your first contribution once
          it does. Caps and reconciliation controls beyond this are still
          being built.
        </div>

        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
        <Button className="mt-4 w-full" onClick={handleReserve} disabled={busy}
            loading={busy}>
          {busy ? "Reserving..." : "Reserve this spot"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="max-w-sm">
      <h1 className="font-display text-xl font-semibold text-primary">
        Pay your deposit
      </h1>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground/60">Amount</dt>
          <dd className="font-medium">{reservation.feeAmount.toLocaleString()} RWF</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/60">Pay to</dt>
          <dd className="font-medium">
            {UZUZA_CUSTODY_NUMBER ?? "Uzuza custody number (being finalized)"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/60">Reference</dt>
          <dd className="font-mono font-medium">{reservation.reference}</dd>
        </div>
      </dl>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3">
        <PaymentChannelPicker
          register={register}
          watch={watch}
          setValue={setValue}
          rwfAmount={reservation.feeAmount}
        />
        <Field
          label="MoMo transaction ID / confirmation text"
          placeholder="e.g. MP240613.1234.A56789"
          error={errors.transactionId?.message}
          {...register("transactionId")}
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Screenshot of payment</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm"
            {...register("screenshot")}
          />
          {errors.screenshot?.message && (
            <span role="alert" className="text-xs text-danger">{errors.screenshot.message}</span>
          )}
        </label>
        <ScreenshotPreview files={watch("screenshot")} />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit proof"}
        </Button>
      </form>
    </Card>
  );
}
