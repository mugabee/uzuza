"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  payoutProofSchema,
  type PayoutProofFormInput,
  type PayoutProofInput,
} from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

type PayoutRequest = {
  id: string;
  amount: number;
  status: "pending" | "approved" | "completed";
  recipient_user_id: string;
} | null;

type PayoutTarget =
  | { type: "cycle"; cycleId: string }
  | { type: "event"; groupId: string };

export function PayoutPanel({
  target,
  isAdmin,
  payoutRequest,
  approvalCount,
  hasApproved,
  recipientName,
  readyMessage = "All contributions confirmed.",
}: {
  target: PayoutTarget;
  isAdmin: boolean;
  payoutRequest: PayoutRequest;
  approvalCount: number;
  hasApproved: boolean;
  recipientName: string;
  readyMessage?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PayoutProofFormInput, unknown, PayoutProofInput>({
    resolver: zodResolver(payoutProofSchema),
  });

  async function handleRequest() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } =
      target.type === "cycle"
        ? await supabase.rpc("request_payout", { p_cycle_id: target.cycleId })
        : await supabase.rpc("request_event_payout", { p_group_id: target.groupId });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Payout requested");
    router.refresh();
  }

  async function handleApprove() {
    if (!payoutRequest) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("approve_payout", {
      p_payout_request_id: payoutRequest.id,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Payout approved");
    router.refresh();
  }

  async function onComplete(values: PayoutProofInput) {
    if (!payoutRequest) return;
    setError(null);
    const supabase = createClient();

    const path = `${payoutRequest.id}/${Date.now()}-${values.screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("payout-proofs")
      .upload(path, values.screenshot);
    if (uploadError) {
      setError(friendlyError(uploadError.message));
      return;
    }

    const { error: rpcError } = await supabase.rpc("complete_payout", {
      p_payout_request_id: payoutRequest.id,
      p_transaction_id: values.transactionId,
      p_screenshot_path: path,
    });
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Payout completed");
    router.refresh();
  }

  if (!payoutRequest) {
    if (!isAdmin) {
      return (
        <Card>
          <p className="text-sm text-foreground/70">
            {readyMessage} Waiting for an admin to request the payout to{" "}
            {recipientName}.
          </p>
        </Card>
      );
    }
    return (
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Payout
        </h2>
        <p className="mt-1 text-sm text-foreground/70">
          {readyMessage} Request the payout to {recipientName}.
        </p>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <Button className="mt-3 w-full" onClick={handleRequest} disabled={busy}>
          {busy ? "Requesting..." : "Request Payout"}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Payout to {recipientName}
      </h2>
      <p className="mt-1 text-sm text-foreground/70">
        {Number(payoutRequest.amount).toLocaleString()} RWF
      </p>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {payoutRequest.status === "pending" && (
        <>
          <p className="mt-3 text-sm">{approvalCount} approval(s) so far.</p>
          {isAdmin && !hasApproved && (
            <Button className="mt-3 w-full" onClick={handleApprove} disabled={busy}>
              {busy ? "Approving..." : "Approve Payout"}
            </Button>
          )}
          {isAdmin && hasApproved && (
            <p className="mt-3 text-xs text-foreground/50">
              You've approved — waiting on other admins.
            </p>
          )}
        </>
      )}

      {payoutRequest.status === "approved" && isAdmin && (
        <form
          onSubmit={handleSubmit(onComplete)}
          className="mt-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-primary">
            Threshold met — send the funds, then record proof.
          </p>
          <Field
            label="MoMo transaction ID / confirmation text"
            placeholder="e.g. MP240613.1234.A56789"
            error={errors.transactionId?.message}
            {...register("transactionId")}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">
              Screenshot of transfer
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Mark Completed"}
          </Button>
        </form>
      )}

      {payoutRequest.status === "approved" && !isAdmin && (
        <p className="mt-3 text-sm text-foreground/70">
          Approved — waiting for an admin to send the funds.
        </p>
      )}

      {payoutRequest.status === "completed" && (
        <p className="mt-3 text-sm font-medium text-primary">
          Completed — funds sent to {recipientName}.
        </p>
      )}
    </Card>
  );
}
