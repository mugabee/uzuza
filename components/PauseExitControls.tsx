"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { friendlyError } from "@/lib/friendly-error";

export function PauseExitControls({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "pause" | "exit">("none");
  const [reason, setReason] = useState("");
  const [agreement, setAgreement] = useState<string | null>(null);
  const [exitRequestId, setExitRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleRequestPause() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("request_pause", {
      p_group_id: groupId,
      p_reason: reason || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    setDone("Pause requested — waiting for an admin to approve.");
    setMode("none");
  }

  async function handlePreviewExit() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("request_exit", {
      p_group_id: groupId,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    const { data: row } = await supabase
      .from("exit_requests")
      .select("summary")
      .eq("id", data)
      .single();
    setExitRequestId(data);
    setAgreement(row?.summary ?? null);
  }

  if (done) {
    return (
      <Card>
        <p className="text-sm text-primary">{done}</p>
      </Card>
    );
  }

  if (agreement) {
    return (
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Exit Agreement
        </h2>
        <p className="mt-2 text-sm text-foreground/80">{agreement}</p>
        <p className="mt-3 text-xs text-foreground/50">
          Sent to the group's admins for approval. Exit request:{" "}
          {exitRequestId}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      {mode === "none" && (
        <div className="flex gap-4 text-xs">
          <button
            type="button"
            onClick={() => setMode("pause")}
            className="text-foreground/50 underline-offset-2 hover:underline"
          >
            Request pause
          </button>
          <button
            type="button"
            onClick={handlePreviewExit}
            disabled={busy}
            className="text-foreground/50 underline-offset-2 hover:underline"
          >
            Request to exit
          </button>
        </div>
      )}

      {mode === "pause" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why do you need to skip this round? (optional)"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            rows={2}
          />
          {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleRequestPause} disabled={busy}
            loading={busy}>
              {busy ? "Requesting..." : "Request pause"}
            </Button>
            <Button variant="secondary" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && mode === "none" && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </Card>
  );
}
