"use client";

import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { createClient } from "../lib/supabase/client";

const LOCK_KEY = "uzuza_app_locked";
const HIDDEN_AT_KEY = "uzuza_hidden_at";
const LOCK_THRESHOLD_MS = 60_000;

/**
 * Local re-authentication gate for users who've enrolled a passkey at
 * /profile/security — locks the app after it's been backgrounded for a
 * while and requires a fresh WebAuthn assertion to resume, without ever
 * touching the underlying Supabase session (which stays valid throughout).
 * A no-op for anyone who hasn't enrolled a passkey.
 */
export function AppLockGate({ signedIn }: { signedIn: boolean }) {
  const [hasPasskey, setHasPasskey] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!signedIn || checked.current) return;
    checked.current = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("webauthn_credentials").select("id").limit(1);
      const enrolled = !!data && data.length > 0;
      setHasPasskey(enrolled);
      if (enrolled && sessionStorage.getItem(LOCK_KEY) === "1") {
        setLocked(true);
      }
    })();
  }, [signedIn]);

  useEffect(() => {
    if (!hasPasskey) return;
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        sessionStorage.setItem(HIDDEN_AT_KEY, String(Date.now()));
        return;
      }
      const hiddenAt = Number(sessionStorage.getItem(HIDDEN_AT_KEY) ?? 0);
      if (hiddenAt && Date.now() - hiddenAt > LOCK_THRESHOLD_MS) {
        sessionStorage.setItem(LOCK_KEY, "1");
        setLocked(true);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [hasPasskey]);

  async function handleUnlock() {
    setError(null);
    setUnlocking(true);
    try {
      const optionsRes = await fetch("/api/webauthn/auth-options", { method: "POST" });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error ?? "Could not start unlock");

      const credential = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok || !verifyBody.verified) {
        throw new Error(verifyBody.error ?? "Unlock failed");
      }

      sessionStorage.removeItem(LOCK_KEY);
      setLocked(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock — try again");
    } finally {
      setUnlocking(false);
    }
  }

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-paper px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="font-display text-xl font-semibold text-primary">Uzuza is locked</h1>
        <p className="mt-1 text-sm text-foreground/60">Use your passkey to continue.</p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={handleUnlock}
        disabled={unlocking}
        className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity duration-150 disabled:opacity-60"
      >
        {unlocking ? "Verifying..." : "Unlock with passkey"}
      </button>
    </div>
  );
}
