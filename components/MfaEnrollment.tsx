"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

type Factor = { id: string; status: "verified" | "unverified"; friendly_name: string | null };

export function MfaEnrollment() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp as Factor[]) ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPendingFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setEnrolling(true);
  }

  async function confirmEnroll() {
    if (!pendingFactorId || code.length !== 6) return;
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: pendingFactorId,
    });
    if (challengeError) {
      setBusy(false);
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: pendingFactorId,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setEnrolling(false);
    setQrCode(null);
    setPendingFactorId(null);
    setCode("");
    refresh();
  }

  async function unenroll(factorId: string) {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    refresh();
  }

  if (factors === null) {
    return <Card>Loading...</Card>;
  }

  const verified = factors.find((f) => f.status === "verified");

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Two-factor authentication
      </h2>
      <p className="mt-1 text-sm text-foreground/60">
        Approving or completing a payout, or moving a group's funds into
        Uzuza custody, requires a verified second factor on your account.
      </p>

      {verified ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">
            Enabled — {verified.friendly_name ?? "authenticator app"}
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={busy}
            onClick={() => unenroll(verified.id)}
          >
            Remove second factor
          </Button>
        </div>
      ) : enrolling ? (
        <div className="mt-4 flex flex-col gap-3">
          {qrCode && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrCode} alt="Scan with your authenticator app" className="h-40 w-40" />
          )}
          <p className="text-xs text-foreground/60">
            Scan the code with an authenticator app (Google Authenticator,
            Authy, etc.), then enter the 6-digit code it shows.
          </p>
          <Field
            label="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button disabled={busy || code.length !== 6} onClick={confirmEnroll}>
            {busy ? "Verifying..." : "Confirm"}
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          <Button disabled={busy} onClick={startEnroll}>
            {busy ? "Starting..." : "Enroll a second factor"}
          </Button>
        </div>
      )}
    </Card>
  );
}
