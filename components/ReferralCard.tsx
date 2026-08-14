"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { Card } from "@/components/Card";
import { useToast } from "../lib/toast";

export function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [referredCount, setReferredCount] = useState(0);
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_referral_stats");
      const row = data?.[0];
      if (!cancelled && row) {
        setCode(row.invite_code);
        setReferredCount(row.referred_count);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    showToast("Invite code copied");
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Invite friends
      </h2>
      <p className="mt-1 text-sm text-foreground/60">
        Bringing in a known contact means matched groups aren't 100% strangers.
      </p>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            My invite code
          </p>
          <p className="font-display text-xl font-bold tracking-widest text-foreground">
            {code ?? "······"}
          </p>
        </div>
        <button
          type="button"
          onClick={copyCode}
          disabled={!code}
          aria-label="Copy invite code"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/50 transition-colors duration-150 hover:bg-primary/5 hover:text-primary disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-foreground/60">Friends referred</span>
        <span className="font-semibold text-foreground">{referredCount}</span>
      </div>
    </Card>
  );
}
