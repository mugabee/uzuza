"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

type FraudFlag = {
  id: string;
  flag_type:
    | "large_transaction"
    | "high_velocity"
    | "ledger_drift_detected"
    | "stale_approved_payout"
    | "stalled_forming_group";
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  amount: number | null;
  details: Record<string, unknown>;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

const LABELS: Record<FraudFlag["flag_type"], { label: string; style: string }> = {
  large_transaction: { label: "Large transaction", style: "bg-accent/15 text-accent" },
  high_velocity: { label: "High velocity", style: "bg-accent/15 text-accent" },
  ledger_drift_detected: { label: "Critical — ledger drift", style: "bg-danger/15 text-danger" },
  stale_approved_payout: { label: "Stale — payout approved, not completed", style: "bg-danger/15 text-danger" },
  stalled_forming_group: { label: "Stalled forming group", style: "bg-accent/15 text-accent" },
};

function FlagRow({
  f,
  note,
  onNoteChange,
  onResolve,
  busy,
}: {
  f: FraudFlag;
  note: string;
  onNoteChange: (v: string) => void;
  onResolve: () => void;
  busy: boolean;
}) {
  const meta = LABELS[f.flag_type];
  return (
    <Card>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.style}`}>
        {meta.label}
      </span>
      <p className="mt-1.5 text-sm font-medium text-foreground">
        {f.entity_type}
        {f.amount != null && <> · {Number(f.amount).toLocaleString()} RWF</>}
      </p>
      {f.user_id && <p className="text-xs text-foreground/60">User: {f.user_id}</p>}
      <p className="mt-1 text-xs text-foreground/50 font-mono break-all">
        {JSON.stringify(f.details)}
      </p>
      <p className="mt-0.5 text-[11px] text-foreground/40">
        Detected {new Date(f.detected_at).toLocaleString()}
      </p>

      {!f.resolved_at && (
        <div className="mt-3 flex flex-col gap-2">
          <Field
            label="Resolution note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="What did you find? (false positive, real issue, action taken)"
          />
          <Button variant="secondary" onClick={onResolve} disabled={busy} loading={busy}>
            Mark resolved
          </Button>
        </div>
      )}
      {f.resolved_at && (
        <p className="mt-2 text-xs text-foreground/50">
          Resolved {new Date(f.resolved_at).toLocaleString()}
          {f.resolution_note ? ` — ${f.resolution_note}` : ""}
        </p>
      )}
    </Card>
  );
}

export function FraudFlagsClient({ flags }: { flags: FraudFlag[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusyId(id);
    const supabase = createClient();
    await supabase.rpc("resolve_fraud_flag", { p_id: id, p_note: notes[id] ?? null });
    setBusyId(null);
    router.refresh();
  }

  const open = flags.filter((f) => !f.resolved_at);
  const resolved = flags.filter((f) => f.resolved_at).slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-primary">Needs review</h2>
        {open.length === 0 ? (
          <p className="text-sm text-foreground/50">Nothing flagged right now.</p>
        ) : (
          open.map((f) => (
            <FlagRow
              key={f.id}
              f={f}
              note={notes[f.id] ?? ""}
              onNoteChange={(v) => setNotes((prev) => ({ ...prev, [f.id]: v }))}
              onResolve={() => resolve(f.id)}
              busy={busyId === f.id}
            />
          ))
        )}
      </div>

      {resolved.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-primary">Recently resolved</h2>
          {resolved.map((f) => (
            <FlagRow key={f.id} f={f} note="" onNoteChange={() => {}} onResolve={() => {}} busy={false} />
          ))}
        </div>
      )}
    </div>
  );
}
