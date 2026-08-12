"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import {
  createPledgeSchema,
  type CreatePledgeInput,
  pledgeProofSchema,
  type PledgeProofFormInput,
  type PledgeProofInput,
} from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { friendlyError } from "@/lib/friendly-error";
import { compressImage } from "@/lib/compress-image";
import { ScreenshotPreview } from "@/components/ScreenshotPreview";
import { PaymentChannelPicker } from "@/components/PaymentChannelPicker";

type Group = { id: string; name: string; contribution_amount: number };

export function PledgeCard({ group }: { group: Group }) {
  const [pledge, setPledge] = useState<{
    id: string;
    amount: number;
    reference: string;
  } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreatePledgeInput>({
    resolver: zodResolver(createPledgeSchema),
    defaultValues: {
      amount: group.contribution_amount,
      visibility: "public",
    },
  });
  const [pledgeError, setPledgeError] = useState<string | null>(null);

  async function onPledge(values: CreatePledgeInput) {
    setPledgeError(null);
    const supabase = createClient();
    const { data: pledgeId, error } = await supabase.rpc("create_pledge", {
      p_group_id: group.id,
      p_amount: values.amount,
      p_visibility: values.visibility,
    });
    if (error) {
      setPledgeError(friendlyError(error.message));
      return;
    }
    setPledge({
      id: pledgeId,
      amount: values.amount,
      reference: `UZP-${group.id.slice(0, 6)}`,
    });
  }

  async function handleCancel() {
    if (!pledge) return;
    const supabase = createClient();
    await supabase.rpc("cancel_pledge", { p_pledge_id: pledge.id });
    setCancelled(true);
  }

  const {
    register: registerProof,
    handleSubmit: handleSubmitProof,
    watch: watchProof,
    setValue: setValueProof,
    formState: { errors: proofErrors, isSubmitting: proofSubmitting },
  } = useForm<PledgeProofFormInput, unknown, PledgeProofInput>({
    resolver: zodResolver(pledgeProofSchema),
    defaultValues: { paymentChannel: "momo_manual", payerCurrency: "RWF" },
  });
  const [proofError, setProofError] = useState<string | null>(null);

  async function onSubmitProof(values: PledgeProofInput) {
    if (!pledge) return;
    setProofError(null);
    const supabase = createClient();

    const fileToUpload = await compressImage(values.screenshot);
    const path = `${pledge.id}/${Date.now()}-${values.screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("pledge-proofs")
      .upload(path, fileToUpload);
    if (uploadError) {
      setProofError(friendlyError(uploadError.message));
      return;
    }

    const fxRate =
      values.paymentChannel !== "momo_manual" && values.payerAmount
        ? pledge.amount / values.payerAmount
        : undefined;

    const { error: rpcError } = await supabase.rpc("submit_pledge_proof", {
      p_pledge_id: pledge.id,
      p_transaction_id: values.transactionId,
      p_screenshot_path: path,
      p_payment_channel: values.paymentChannel,
      p_payer_currency: values.payerCurrency,
      p_payer_amount: values.payerAmount ?? null,
      p_fx_rate_to_rwf: fxRate ?? null,
    });
    if (rpcError) {
      setProofError(friendlyError(rpcError.message));
      return;
    }
    setSubmitted(true);
  }

  if (cancelled) {
    return (
      <Card className="max-w-sm text-center">
        <p className="text-sm text-foreground/70">Pledge cancelled.</p>
        <Link href={`/groups/${group.id}`}>
          <Button className="mt-6 w-full">Back to event</Button>
        </Link>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card className="max-w-sm text-center">
        <h1 className="font-display text-xl font-semibold text-primary">
          Thank you!
        </h1>
        <p className="mt-2 text-sm text-foreground/70">
          Your pledge is waiting for the organizer to confirm.
        </p>
        <Link href={`/groups/${group.id}`}>
          <Button className="mt-6 w-full">Back to event</Button>
        </Link>
      </Card>
    );
  }

  if (!pledge) {
    return (
      <Card className="max-w-sm">
        <h1 className="font-display text-xl font-semibold text-primary">
          Pledge to {group.name}
        </h1>
        <form onSubmit={handleSubmit(onPledge)} className="mt-4 flex flex-col gap-3">
          <Field
            label="Pledge amount (RWF)"
            type="number"
            error={errors.amount?.message}
            {...register("amount")}
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
          {pledgeError && <p role="alert" className="text-xs text-red-500">{pledgeError}</p>}
          <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
            {isSubmitting ? "Pledging..." : "Pledge"}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="max-w-sm">
      <h1 className="font-display text-xl font-semibold text-primary">
        Pay your pledge
      </h1>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground/60">Amount</dt>
          <dd className="font-medium">{pledge.amount.toLocaleString()} RWF</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/60">Reference</dt>
          <dd className="font-mono font-medium">{pledge.reference}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-foreground/50">
        Pay via MoMo to the organizer's number shown on the event page, then
        submit proof below — or cancel if you've changed your mind.
      </p>

      <form onSubmit={handleSubmitProof(onSubmitProof)} className="mt-4 flex flex-col gap-3">
        <PaymentChannelPicker
          register={registerProof}
          watch={watchProof}
          setValue={setValueProof}
          rwfAmount={pledge.amount}
        />
        <Field
          label="MoMo transaction ID / confirmation text"
          placeholder="e.g. MP240613.1234.A56789"
          error={proofErrors.transactionId?.message}
          {...registerProof("transactionId")}
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Screenshot of payment</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm"
            {...registerProof("screenshot")}
          />
          {proofErrors.screenshot?.message && (
            <span role="alert" className="text-xs text-red-500">{proofErrors.screenshot.message}</span>
          )}
        </label>
        <ScreenshotPreview files={watchProof("screenshot")} />
        {proofError && <p role="alert" className="text-xs text-red-500">{proofError}</p>}
        <Button type="submit" disabled={proofSubmitting}
            loading={proofSubmitting}>
          {proofSubmitting ? "Submitting..." : "Submit proof"}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleCancel}
        className="mt-4 text-xs text-foreground/40 hover:text-red-500"
      >
        Cancel this pledge
      </button>
    </Card>
  );
}
