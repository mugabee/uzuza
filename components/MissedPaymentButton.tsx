"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

export function MissedPaymentButton({
  contributionId,
  onReported,
}: {
  contributionId: string;
  onReported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fine, setFine] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function handleReport() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("report_missed_payment", {
      p_contribution_id: contributionId,
      p_fine_amount: Number(fine) || 0,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Missed payment reported");
    setOpen(false);
    onReported();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-red-500 underline-offset-2 hover:underline"
      >
        Report missed
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        value={fine}
        onChange={(e) => setFine(e.target.value)}
        className="w-16 rounded border border-black/10 px-1 py-0.5 text-xs"
        placeholder="Fine"
      />
      <Button onClick={handleReport} disabled={busy} className="px-2 py-1 text-xs">
        {busy ? "..." : "Confirm"}
      </Button>
      {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
