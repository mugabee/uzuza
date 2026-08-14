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
import { useLanguage } from "../lib/i18n";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";
import { compressImage } from "../lib/compress-image";
import { ScreenshotPreview } from "@/components/ScreenshotPreview";
import { PaymentChannelPicker } from "@/components/PaymentChannelPicker";
import { PayContributionWithMomo } from "@/components/PayContributionWithMomo";
import { BottomSheet } from "@/components/BottomSheet";

type Contribution = {
  id: string;
  unique_reference: string;
  amount: number;
  status:
    | "pending"
    | "submitted"
    | "confirmed"
    | "rejected"
    | "missed"
    | "late_submitted"
    | "paid_late";
  rejected_reason: string | null;
  missed_fine_amount?: number | null;
  screenshot_path?: string | null;
};

export function ContributeCard({
  contribution,
  groupMomoNumber,
  myPhone,
  onSubmitted,
}: {
  contribution: Contribution;
  groupMomoNumber: string | null;
  myPhone?: string;
  onSubmitted: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { t } = useLanguage();
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
        ? Number(contribution.amount) / values.payerAmount
        : undefined;

    const { error: rpcError } = await supabase.rpc("submit_contribution_proof", {
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

    showToast("Proof submitted");
    setSheetOpen(false);
    onSubmitted();
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        {t("yourContribution")}
      </h2>

      {contribution.status === "confirmed" && (
        <p className="mt-2 text-sm font-medium text-primary">
          {t("confirmedThankYou")}
        </p>
      )}

      {(contribution.status === "pending" || contribution.status === "submitted") && (
        <>
          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground/60">{t("amount")}</dt>
              <dd className="font-medium">
                {Number(contribution.amount).toLocaleString()} RWF
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">{t("payTo")}</dt>
              <dd className="font-medium">{groupMomoNumber ?? t("notSetYet")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">{t("reference")}</dt>
              <dd className="font-mono font-medium">
                {contribution.unique_reference}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-foreground/50">
            {t("sendInstructions")}
          </p>
        </>
      )}

      {contribution.status === "pending" && contribution.rejected_reason && (
        <p className="mt-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">
          {t("previousRejected")}: {contribution.rejected_reason}. {t("pleaseResubmit")}
        </p>
      )}

      {contribution.status === "pending" && (
        <>
          <div className="mt-4">
            <PayContributionWithMomo
              contributionId={contribution.id}
              amount={Number(contribution.amount)}
              defaultPhone={myPhone ?? ""}
              onConfirmed={onSubmitted}
            />
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground/60 hover:text-foreground/80">
              Prefer to pay a different way?
            </summary>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => setSheetOpen(true)}>
              {t("submitProof")}
            </Button>
          </details>

          <BottomSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title={t("submitProof")}
          >
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-3"
            >
              <PaymentChannelPicker
                register={register}
                watch={watch}
                setValue={setValue}
                rwfAmount={Number(contribution.amount)}
              />
              <Field
                label={t("transactionIdLabel")}
                placeholder="e.g. MP240613.1234.A56789"
                error={errors.transactionId?.message}
                {...register("transactionId")}
              />
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">
                  {t("screenshotLabel")}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="text-sm"
                  {...register("screenshot")}
                />
                {errors.screenshot?.message && (
                  <span role="alert" className="text-xs text-danger">
                    {errors.screenshot.message}
                  </span>
                )}
              </label>
              <ScreenshotPreview files={watch("screenshot")} />
              {submitError && <p role="alert" className="text-xs text-danger">{submitError}</p>}
              <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
                {isSubmitting ? t("submitting") : t("submitProof")}
              </Button>
            </form>
          </BottomSheet>
        </>
      )}

      {contribution.status === "submitted" && (
        <p className="mt-4 text-sm text-foreground/70">
          {t("waitingConfirmation")}
        </p>
      )}

      {contribution.status !== "pending" && contribution.screenshot_path && (
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
        </div>
      )}

      {contribution.status === "missed" && (
        <p className="mt-4 rounded-lg bg-danger/10 p-2 text-sm text-danger">
          {t("markedMissed")}
          {contribution.missed_fine_amount != null &&
            ` — ${t("fineApplies")} ${Number(contribution.missed_fine_amount).toLocaleString()} ${t("rwfApplies")}`}
          . {t("contactAdmin")}
        </p>
      )}
    </Card>
  );
}
