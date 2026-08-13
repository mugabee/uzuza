"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/lib/toast";

type Passkey = { id: string; device_label: string | null; created_at: string };

function browserSupportsPasskeys() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export function PasskeySetup() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase
      .from("webauthn_credentials")
      .select("id, device_label, created_at")
      .order("created_at", { ascending: false });
    setPasskeys(data ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function enroll() {
    setError(null);
    setBusy(true);
    try {
      const optionsRes = await fetch("/api/webauthn/register-options", { method: "POST" });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error ?? "Could not start passkey setup");

      const credential = await startRegistration({ optionsJSON: options });

      const label =
        typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent)
          ? "iPhone / iPad"
          : typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
            ? "Android device"
            : "This device";

      const verifyRes = await fetch("/api/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, deviceLabel: label }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok || !verifyBody.verified) {
        throw new Error(verifyBody.error ?? "Could not save passkey");
      }
      showToast("Passkey added");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add a passkey on this device");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("webauthn_credentials").delete().eq("id", id);
    setBusy(false);
    showToast("Passkey removed");
    refresh();
  }

  if (passkeys === null) return <Card>Loading...</Card>;

  if (!browserSupportsPasskeys()) {
    return null;
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">Passkey app lock</h2>
      <p className="mt-1 text-sm text-foreground/60">
        Once enrolled, Uzuza locks itself after being in the background a while, and asks for
        Face ID / fingerprint / device PIN to get back in — your sign-in stays the same, this
        just guards the app on this device.
      </p>

      {passkeys.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{p.device_label ?? "Device"}</p>
                <p className="text-xs text-foreground/50">
                  Added {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={busy}
                className="text-xs font-medium text-danger transition-opacity duration-150 hover:opacity-70 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      <Button variant="secondary" className="mt-4" disabled={busy} loading={busy} onClick={enroll}>
        {busy ? "Setting up..." : "Add a passkey on this device"}
      </Button>
    </Card>
  );
}
