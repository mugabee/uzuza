"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "../lib/supabase/client";
import {
  contributionProofSchema,
  type ContributionProofFormInput,
  type ContributionProofInput,
} from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";
import { compressImage } from "../lib/compress-image";
import { ScreenshotPreview } from "@/components/ScreenshotPreview";
import { PaymentChannelPicker } from "@/components/PaymentChannelPicker";

type Contribution = {
  id: string;
  amount: number;
  status:
    | "pending"
    | "submitted"
    | "confirmed"
    | "rejected"
    | "missed"
    | "late_submitted"
    | "paid_late";
  missed_fine_amount?: number | null;
  screenshot_path?: string | null;
};

export function LatePaymentCard({
  contribution,
  groupMomoNumber,
  onSubmitted,
}: {
  contribution: Contribution;
  groupMomoNumber: string | null;
  onSubmitted: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const showToast = useToast();

  async function handleViewScreenshot() {
    if (!contribution.screenshot_path) return;
    setLoadingScreenshot(true);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("contribution-proofs")
      .createSignedUrl(contribution.screenshot_path, 60);
    setLoadingScreenshot(false);
    if (error) {
      setSubmitError(friendlyError(error.message));
      return;
    }
    setScreenshotUrl(data.signedUrl);
  }
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContributionProofFormInput, unknown, ContributionProofInput>({
    resolver: zodResolver(contributionProofSchema),
    defaultValues: { paymentChannel: "momo_manual", payerCurrency: "RWF" },
  });

  const owed = Number(contribution.amount) + Number(contribution.missed_fine_amount ?? 0);

  async function onSubmit(values: ContributionProofInput) {
    setSubmitError(null);
    const supabase = createClient();

    const fileToUpload = await compressImage(values.screenshot);
    const path = `${contribution.id}/${Date.now()}-${values.screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("contribution-proofs")
      .upload(path, fileToUpload);

    if (uploadError) {
      setSubmitError(friendlyError(uploadError.message));
      return;
    }

    const fxRate =
      values.paymentChannel !== "momo_manual" && values.payerAmount
        ? owed / values.payerAmount
        : undefined;

    const { error: rpcError } = await supabase.rpc("submit_late_payment_proof", {
      p_contribution_id: contribution.id,
      p_transaction_id: values.transactionId,
      p_screenshot_path: path,
      p_payment_channel: values.paymentChannel,
      p_payer_currency: values.payerCurrency,
      p_payer_amount: values.payerAmount ?? null,
      p_fx_rate_to_rwf: fxRate ?? null,
    });

    if (rpcError) {
      setSubmitError(friendlyError(rpcError.message));
      return;
    }

    showToast("Late payment proof submitted");
    onSubmitted();
  }

  const screenshotBlock = contribution.screenshot_path && (
    <div className="mt-3">
      {!screenshotUrl ? (
        <button
          type="button"
          onClick={handleViewScreenshot}
          disabled={loadingScreenshot}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
        >
          {loadingScreenshot ? "Loading..." : "View your submitted screenshot"}
        </button>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={screenshotUrl}
          alt="Your submitted payment screenshot"
          className="max-h-64 rounded-lg border border-border"
        />
      )}
      {submitError && <p role="alert" className="mt-2 text-xs text-danger">{submitError}</p>}
    </div>
  );

  if (contribution.status === "paid_late") {
    return (
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Late payment
        </h2>
        <p className="mt-2 text-sm font-medium text-primary">
          Confirmed — you're back in good standing.
        </p>
        {screenshotBlock}
      </Card>
    );
  }

  if (contribution.status === "late_submitted") {
    return (
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Late payment
        </h2>
        <p className="mt-4 text-sm text-foreground/70">
          Waiting for admin confirmation.
        </p>
        {screenshotBlock}
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Late payment
      </h2>
      <p className="mt-1 text-sm text-foreground/70">
        This cycle already closed without your contribution. You can still
        pay what you owe, including the fine, to stay in good standing.
      </p>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground/60">Amount owed</dt>
          <dd className="font-medium">{owed.toLocaleString()} RWF</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/60">Pay to</dt>
          <dd className="font-medium">{groupMomoNumber ?? "Not set yet"}</dd>
        </div>
      </dl>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3">
        <PaymentChannelPicker
          register={register}
          watch={watch}
          setValue={setValue}
          rwfAmount={owed}
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
        {submitError && <p role="alert" className="text-xs text-danger">{submitError}</p>}
        <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit proof"}
        </Button>
      </form>
    </Card>
  );
}
