"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import { Button } from "@/components/Button";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";

export function CycleDueDateEditor({
  cycleId,
  dueDate,
  isAdmin,
}: {
  cycleId: string;
  dueDate: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const showToast = useToast();

  if (!isAdmin && !dueDate) return null;

  if (!isAdmin) {
    return (
      <p className="text-xs text-foreground/50">
        Due {new Date(dueDate!).toLocaleDateString()}
      </p>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        {dueDate ? `Due ${new Date(dueDate).toLocaleDateString()} — edit` : "Set a due date"}
      </button>
    );
  }

  async function handleSave() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_cycle_due_date", {
      p_cycle_id: cycleId,
      p_due_date: value || null,
    });
    setBusy(false);
    if (error) {
      showToast(friendlyError(error.message), "error");
      return;
    }
    showToast("Due date updated");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
      />
      <Button className="!px-3 !py-1.5 !text-xs" onClick={handleSave} disabled={busy} loading={busy}>
        Save
      </Button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-foreground/50">
        Cancel
      </button>
    </div>
  );
}
