"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

type Discrepancy = {
  id: string;
  source: "contribution" | "wallet_topup" | "wallet_withdrawal";
  source_id: string;
  reference_id: string;
  discrepancy_type: "missing_confirmation" | "false_confirmation" | "phantom_debit" | "stuck_pending";
  internal_status: string;
  momo_status: string;
  amount: number | null;
  auto_resolved: boolean;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

const SEVERITY: Record<Discrepancy["discrepancy_type"], { label: string; style: string }> = {
  false_confirmation: { label: "Critical — confirmed but MoMo failed", style: "bg-danger/15 text-danger" },
  phantom_debit: { label: "Critical — money left, balance not debited", style: "bg-danger/15 text-danger" },
  stuck_pending: { label: "Stuck pending", style: "bg-warning/15 text-warning" },
  missing_confirmation: { label: "Missed confirmation", style: "bg-warning/15 text-warning" },
};

function DiscrepancyRow({
  d,
  note,
  onNoteChange,
  onResolve,
  busy,
}: {
  d: Discrepancy;
  note: string;
  onNoteChange: (v: string) => void;
  onResolve: () => void;
  busy: boolean;
}) {
  const severity = SEVERITY[d.discrepancy_type];
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severity.style}`}>
            {severity.label}
          </span>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {d.source} · {d.reference_id}
          </p>
          <p className="text-xs text-foreground/60">
            Internal: <span className="font-medium">{d.internal_status}</span> · MoMo:{" "}
            <span className="font-medium">{d.momo_status}</span>
            {d.amount != null && <> · {Number(d.amount).toLocaleString()} RWF</>}
          </p>
          <p className="mt-0.5 text-[11px] text-foreground/40">
            Detected {new Date(d.detected_at).toLocaleString()}
          </p>
        </div>
        {d.auto_resolved && (
          <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            Self-healed
          </span>
        )}
      </div>

      {!d.resolved_at && (
        <div className="mt-3 flex flex-col gap-2">
          <Field
            label="Resolution note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="What did you do to resolve this?"
          />
          <Button variant="secondary" onClick={onResolve} disabled={busy} loading={busy}>
            Mark resolved
          </Button>
        </div>
      )}
      {d.resolved_at && !d.auto_resolved && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            Resolved
          </span>
          <p className="text-xs text-foreground/50">
            {new Date(d.resolved_at).toLocaleString()}
            {d.resolution_note ? ` — ${d.resolution_note}` : ""}
          </p>
        </div>
      )}
    </Card>
  );
}

export function ReconciliationClient({ discrepancies }: { discrepancies: Discrepancy[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusyId(id);
    const supabase = createClient();
    await supabase.rpc("resolve_reconciliation_discrepancy", { p_id: id, p_note: notes[id] ?? null });
    setBusyId(null);
    router.refresh();
  }

  const needsAttention = discrepancies.filter((d) => !d.resolved_at);
  const autoHealed = discrepancies.filter((d) => d.auto_resolved).slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-primary">Needs your attention</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-foreground/50">Nothing open — everything reconciles.</p>
        ) : (
          needsAttention.map((d) => (
            <DiscrepancyRow
              key={d.id}
              d={d}
              note={notes[d.id] ?? ""}
              onNoteChange={(v) => setNotes((prev) => ({ ...prev, [d.id]: v }))}
              onResolve={() => resolve(d.id)}
              busy={busyId === d.id}
            />
          ))
        )}
      </div>

      {autoHealed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-primary">Recently self-healed</h2>
          <p className="text-xs text-foreground/50">
            MoMo confirmed these but the internal record hadn't picked it up yet — reconciliation
            called the same confirm path a normal payment would, automatically.
          </p>
          {autoHealed.map((d) => (
            <DiscrepancyRow key={d.id} d={d} note="" onNoteChange={() => {}} onResolve={() => {}} busy={false} />
          ))}
        </div>
      )}
    </div>
  );
}
