"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rejectContributionSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

type Contribution = {
  id: string;
  amount: number;
  missed_fine_amount?: number | null;
  transaction_id: string | null;
  screenshot_path: string | null;
  profile: { full_name: string | null } | null;
};

export function AdminLatePaymentRow({
  contribution,
  onDecided,
}: {
  contribution: Contribution;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const showToast = useToast();

  const owed = Number(contribution.amount) + Number(contribution.missed_fine_amount ?? 0);

  async function handleViewScreenshot() {
    if (!contribution.screenshot_path) return;
    const supabase = createClient();
    const { data, error: urlError } = await supabase.storage
      .from("contribution-proofs")
      .createSignedUrl(contribution.screenshot_path, 60);
    if (urlError) {
      setError(friendlyError(urlError.message));
      return;
    }
    setScreenshotUrl(data.signedUrl);
  }

  async function decide(approve: boolean, rejectReason?: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("confirm_late_payment", {
      p_contribution_id: contribution.id,
      p_approve: approve,
      p_reason: rejectReason ?? null,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast(approve ? "Late payment confirmed" : "Late payment rejected");
    onDecided();
  }

  function handleRejectSubmit() {
    const result = rejectContributionSchema.safeParse({ reason });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    decide(false, result.data.reason);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {contribution.profile?.full_name ?? "Member"} — late payment
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground/70">
        {owed.toLocaleString()} RWF (incl. fine) — txn: {contribution.transaction_id}
      </p>

      {contribution.screenshot_path && !screenshotUrl && (
        <button
          type="button"
          onClick={handleViewScreenshot}
          className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          View screenshot
        </button>
      )}
      {screenshotUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={screenshotUrl}
          alt="Payment screenshot"
          className="mt-2 max-h-64 rounded-lg border border-black/10"
        />
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {!rejecting ? (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => decide(true)} disabled={busy}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being rejected?"
            className="rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary"
            rows={2}
          />
          <div className="flex gap-2">
            <Button onClick={handleRejectSubmit} disabled={busy}>
              Confirm reject
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
