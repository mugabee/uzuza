"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

export function AccountTypeEditor({
  groupId,
  currentAccountType,
}: {
  groupId: string;
  currentAccountType: "group_owned" | "uzuza_held";
}) {
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function switchTo(accountType: "group_owned" | "uzuza_held") {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_account_type", {
      p_group_id: groupId,
      p_account_type: accountType,
      p_consent: accountType === "uzuza_held" ? consented : false,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Account type updated");
    setShowConsent(false);
    router.refresh();
  }

  if (currentAccountType === "uzuza_held") {
    return (
      <div className="mt-4 flex items-center justify-between rounded-lg bg-accent/10 p-3 text-xs">
        <span>Contributions are held in Uzuza custody.</span>
        <div className="flex items-center gap-3">
          <Link
            href={`/groups/${groupId}/custody`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Reconciliation
          </Link>
          <button
            type="button"
            onClick={() => switchTo("group_owned")}
            disabled={busy}
            className="text-foreground/50 underline-offset-2 hover:underline"
          >
            Switch to group-owned
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {!showConsent ? (
        <button
          type="button"
          onClick={() => setShowConsent(true)}
          className="text-xs text-foreground/50 underline-offset-2 hover:underline"
        >
          Hold contributions in Uzuza custody instead
        </button>
      ) : (
        <div className="rounded-lg bg-black/5 p-3 text-xs text-foreground/70">
          <p>
            Uzuza will hold confirmed contributions instead of the group's
            own account, subject to a platform-wide cap and per-group
            reconciliation reporting. Caps and reconciliation reduce risk —
            they do not eliminate it. This is currently sandbox
            infrastructure, not backed by a real dedicated Uzuza business
            account yet.
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5"
            />
            <span>I understand and consent.</span>
          </label>
          {error && <p role="alert" className="mt-2 text-red-500">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => switchTo("uzuza_held")}
              disabled={!consented || busy}
            >
              {busy ? "Saving..." : "Confirm"}
            </Button>
            <Button variant="secondary" onClick={() => setShowConsent(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
