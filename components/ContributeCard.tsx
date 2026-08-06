"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import {
  contributionProofSchema,
  type ContributionProofFormInput,
  type ContributionProofInput,
} from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

type Contribution = {
  id: string;
  unique_reference: string;
  amount: number;
  status: "pending" | "submitted" | "confirmed" | "rejected" | "missed";
  rejected_reason: string | null;
  missed_fine_amount?: number | null;
};

export function ContributeCard({
  contribution,
  groupMomoNumber,
  onSubmitted,
}: {
  contribution: Contribution;
  groupMomoNumber: string | null;
  onSubmitted: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContributionProofFormInput, unknown, ContributionProofInput>({
    resolver: zodResolver(contributionProofSchema),
  });

  async function onSubmit(values: ContributionProofInput) {
    setSubmitError(null);
    const supabase = createClient();

    const path = `${contribution.id}/${Date.now()}-${values.screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("contribution-proofs")
      .upload(path, values.screenshot);

    if (uploadError) {
      setSubmitError(uploadError.message);
      return;
    }

    const { error: rpcError } = await supabase.rpc("submit_contribution_proof", {
      p_contribution_id: contribution.id,
      p_transaction_id: values.transactionId,
      p_screenshot_path: path,
    });

    if (rpcError) {
      setSubmitError(rpcError.message);
      return;
    }

    onSubmitted();
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Your contribution
      </h2>

      {contribution.status === "confirmed" && (
        <p className="mt-2 text-sm font-medium text-primary">
          Confirmed — thank you.
        </p>
      )}

      {(contribution.status === "pending" || contribution.status === "submitted") && (
        <>
          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground/60">Amount</dt>
              <dd className="font-medium">
                {Number(contribution.amount).toLocaleString()} RWF
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">Pay to</dt>
              <dd className="font-medium">{groupMomoNumber ?? "Not set yet"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground/60">Reference</dt>
              <dd className="font-mono font-medium">
                {contribution.unique_reference}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-foreground/50">
            Send this exact amount via MoMo, including the reference above if
            your transfer supports a note. Then submit proof below.
          </p>
        </>
      )}

      {contribution.status === "pending" && contribution.rejected_reason && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">
          Previous submission rejected: {contribution.rejected_reason}. Please
          resubmit.
        </p>
      )}

      {contribution.status === "pending" && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-4 flex flex-col gap-3"
        >
          <Field
            label="MoMo transaction ID / confirmation text"
            placeholder="e.g. MP240613.1234.A56789"
            error={errors.transactionId?.message}
            {...register("transactionId")}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">
              Screenshot of payment
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
              {...register("screenshot")}
            />
            {errors.screenshot?.message && (
              <span className="text-xs text-red-500">
                {errors.screenshot.message}
              </span>
            )}
          </label>
          {submitError && <p className="text-xs text-red-500">{submitError}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit proof"}
          </Button>
        </form>
      )}

      {contribution.status === "submitted" && (
        <p className="mt-4 text-sm text-foreground/70">
          Waiting for admin confirmation.
        </p>
      )}

      {contribution.status === "missed" && (
        <p className="mt-4 rounded-lg bg-red-50 p-2 text-sm text-red-600">
          Marked as missed
          {contribution.missed_fine_amount != null &&
            ` — a fine of ${Number(contribution.missed_fine_amount).toLocaleString()} RWF applies`}
          . Contact an admin.
        </p>
      )}
    </Card>
  );
}
