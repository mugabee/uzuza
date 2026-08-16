"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase/client";
import { compressImage } from "../lib/compress-image";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";

type MatchResult = "match" | "mismatch" | "low_confidence" | "unavailable";

type ExistingRequest = {
  status: "pending" | "approved" | "rejected";
  match_result: MatchResult | null;
  requested_at: string;
};

const MATCH_LABEL: Record<MatchResult, { label: string; style: string }> = {
  match: { label: "Name matches", style: "bg-primary/10 text-primary" },
  low_confidence: { label: "Possible match — needs a closer look", style: "bg-accent/15 text-accent" },
  mismatch: { label: "Name does not match", style: "bg-danger/15 text-danger" },
  unavailable: { label: "Automatic check unavailable", style: "bg-surface-secondary text-foreground/60" },
};

export function IdVerificationCard({
  identityVerified,
  existingRequest,
}: {
  identityVerified: boolean;
  existingRequest: ExistingRequest | null;
}) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matchResult: MatchResult; extractedName: string | null; notes: string } | null>(null);
  const showToast = useToast();

  async function handleSubmit() {
    if (!front || !back) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");

      const frontFile = await compressImage(front);
      const backFile = await compressImage(back);
      const stamp = Date.now();
      const frontPath = `${user.id}/front-${stamp}-${frontFile.name}`;
      const backPath = `${user.id}/back-${stamp}-${backFile.name}`;

      const [frontUpload, backUpload] = await Promise.all([
        supabase.storage.from("id-verification-photos").upload(frontPath, frontFile),
        supabase.storage.from("id-verification-photos").upload(backPath, backFile),
      ]);
      if (frontUpload.error) throw frontUpload.error;
      if (backUpload.error) throw backUpload.error;

      const res = await fetch("/api/id-verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontPath, backPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit for verification");

      setResult({ matchResult: data.matchResult, extractedName: data.extractedName, notes: data.notes });
      showToast("Submitted for review");
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (identityVerified) {
    return (
      <Card>
        <h3 className="font-display text-sm font-semibold text-primary">Identity Verification</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            ✓ Verified
          </span>
        </p>
      </Card>
    );
  }

  const pendingReview = existingRequest?.status === "pending" && !result;

  return (
    <Card>
      <h3 className="font-display text-sm font-semibold text-primary">Identity Verification</h3>
      <p className="mt-1 text-xs text-foreground/60">
        Upload the front and back of your national ID (or equivalent). We&apos;ll auto-check the
        printed name against your Uzuza profile, then a staff member reviews and confirms it —
        this step is required before joining certain matched groups.
      </p>

      {existingRequest?.status === "rejected" && !result && (
        <p className="mt-2 text-xs text-danger">
          Your last submission was not approved. You can submit again below.
        </p>
      )}

      {pendingReview ? (
        <p className="mt-3 text-sm text-foreground/70">
          Submitted {new Date(existingRequest.requested_at).toLocaleDateString()} — waiting on
          staff review.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-foreground/70">Front of ID</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFront(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/70">Back of ID</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setBack(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button onClick={handleSubmit} disabled={!front || !back || busy} loading={busy}>
            Submit for verification
          </Button>
        </div>
      )}

      {result && (
        <div className="mt-3 flex flex-col gap-1 rounded-lg border border-border p-3">
          <span className={`self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MATCH_LABEL[result.matchResult].style}`}>
            {MATCH_LABEL[result.matchResult].label}
          </span>
          {result.extractedName && (
            <p className="mt-1 text-xs text-foreground/60">Name read from ID: {result.extractedName}</p>
          )}
          <p className="text-[11px] text-foreground/40">{result.notes}</p>
          <p className="mt-1 text-xs text-foreground/60">
            This is an automatic hint only — a staff member will review your photos and confirm
            your verification.
          </p>
        </div>
      )}
    </Card>
  );
}
