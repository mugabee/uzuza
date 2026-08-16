"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type MatchResult = "match" | "mismatch" | "low_confidence" | "unavailable";

type IdRequest = {
  id: string;
  user_id: string;
  user_name: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  front_image_path: string;
  back_image_path: string;
  submitted_full_name: string | null;
  extracted_name: string | null;
  match_result: MatchResult | null;
  match_confidence: number | null;
  ai_notes: string | null;
};

const MATCH_LABEL: Record<MatchResult, { label: string; style: string }> = {
  match: { label: "AI: name matches", style: "bg-primary/10 text-primary" },
  low_confidence: { label: "AI: possible match", style: "bg-accent/15 text-accent" },
  mismatch: { label: "AI: name mismatch", style: "bg-danger/15 text-danger" },
  unavailable: { label: "AI check unavailable", style: "bg-surface-secondary text-foreground/60" },
};

function PhotoViewer({ label, path }: { label: string; path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function view() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.storage.from("id-verification-photos").createSignedUrl(path, 120);
    setLoading(false);
    if (data) setUrl(data.signedUrl);
  }

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label} className="h-32 w-auto rounded-lg border border-border object-contain" />;
  }
  return (
    <Button variant="secondary" onClick={view} disabled={loading} loading={loading}>
      View {label}
    </Button>
  );
}

function RequestCard({
  r,
  onDecide,
  busy,
}: {
  r: IdRequest;
  onDecide: (approve: boolean) => void;
  busy: boolean;
}) {
  const match = r.match_result ? MATCH_LABEL[r.match_result] : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{r.user_name ?? "Unnamed user"}</p>
          <p className="text-xs text-foreground/50">{r.user_id}</p>
        </div>
        {match && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${match.style}`}>
            {match.label}
          </span>
        )}
      </div>

      <div className="mt-2 text-xs text-foreground/60">
        <p>Registered name: <span className="font-medium text-foreground">{r.submitted_full_name ?? "—"}</span></p>
        <p>Name read from ID: <span className="font-medium text-foreground">{r.extracted_name ?? "—"}</span></p>
        {r.match_confidence != null && <p>Similarity score: {(Number(r.match_confidence) * 100).toFixed(0)}%</p>}
        {r.ai_notes && <p className="mt-1 text-[11px] text-foreground/40">{r.ai_notes}</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <PhotoViewer label="front" path={r.front_image_path} />
        <PhotoViewer label="back" path={r.back_image_path} />
      </div>

      <p className="mt-2 text-[11px] text-foreground/40">
        Requested {new Date(r.requested_at).toLocaleString()}
      </p>

      {r.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => onDecide(true)} disabled={busy} loading={busy}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => onDecide(false)} disabled={busy} loading={busy}>
            Reject
          </Button>
        </div>
      ) : (
        <p className={`mt-3 text-xs font-medium ${r.status === "approved" ? "text-primary" : "text-danger"}`}>
          {r.status === "approved" ? "Approved" : "Rejected"} by staff
        </p>
      )}
    </Card>
  );
}

export function IdReviewClient({ requests }: { requests: IdRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDecide(id: string, approve: boolean) {
    setBusyId(id);
    const supabase = createClient();
    await supabase.rpc("decide_id_verification", { p_id: id, p_approve: approve });
    setBusyId(null);
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-primary">Needs review</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-foreground/50">No pending ID verification requests.</p>
        ) : (
          pending.map((r) => (
            <RequestCard key={r.id} r={r} onDecide={(approve) => handleDecide(r.id, approve)} busy={busyId === r.id} />
          ))
        )}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-primary">Recently decided</h2>
          {decided.map((r) => (
            <RequestCard key={r.id} r={r} onDecide={() => {}} busy={false} />
          ))}
        </div>
      )}
    </div>
  );
}
