"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import { Button } from "@/components/Button";

export function AcknowledgeButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAcknowledge() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("acknowledge_constitution", {
      p_group_id: groupId,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      {error && <p role="alert" className="mb-2 text-xs text-danger">{error}</p>}
      <Button onClick={handleAcknowledge} disabled={busy}
            loading={busy}>
        {busy ? "Saving..." : "I acknowledge"}
      </Button>
    </div>
  );
}
