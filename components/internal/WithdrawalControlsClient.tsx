"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type Requirement = "none" | "mfa" | "kyc" | "both";

type Override = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  requirement: Requirement;
  set_at: string;
};

type ProfileResult = { id: string; full_name: string | null; phone: string | null; identity_verified: boolean };

const REQUIREMENT_LABEL: Record<Requirement, string> = {
  none: "None",
  mfa: "MFA only",
  kyc: "Full KYC only",
  both: "MFA + Full KYC",
};

function RequirementSelect({
  value,
  onChange,
  disabled,
}: {
  value: Requirement;
  onChange: (v: Requirement) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Requirement)}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
    >
      {(Object.keys(REQUIREMENT_LABEL) as Requirement[]).map((r) => (
        <option key={r} value={r}>
          {REQUIREMENT_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

export function WithdrawalControlsClient({
  globalRequirement,
  overrides,
}: {
  globalRequirement: Requirement;
  overrides: Override[];
}) {
  const router = useRouter();
  const [globalValue, setGlobalValue] = useState<Requirement>(globalRequirement);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [overrideChoice, setOverrideChoice] = useState<Requirement>("kyc");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function saveGlobal() {
    setSavingGlobal(true);
    const supabase = createClient();
    await supabase.rpc("set_global_withdrawal_requirement", { p_requirement: globalValue });
    setSavingGlobal(false);
    router.refresh();
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("search_profiles_for_staff", { p_query: query.trim() });
    setSearching(false);
    setResults(data ?? []);
  }

  async function setOverride(userId: string) {
    setBusyUserId(userId);
    const supabase = createClient();
    await supabase.rpc("set_user_withdrawal_requirement_override", {
      p_user_id: userId,
      p_requirement: overrideChoice,
    });
    setBusyUserId(null);
    router.refresh();
  }

  async function clearOverride(userId: string) {
    setBusyUserId(userId);
    const supabase = createClient();
    await supabase.rpc("clear_user_withdrawal_requirement_override", { p_user_id: userId });
    setBusyUserId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">Platform-wide default</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Applies to every withdrawal, unless a specific member has an override below.
        </p>

        <div className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-foreground/70">
          <strong>Known issue:</strong> real TOTP (MFA) enrollment currently fails on this
          project&apos;s hosted Supabase instance (a server-side &quot;Error generating QR
          Code&quot; bug, not anything in this app). Since no user can actually enroll a
          working second factor right now, setting the requirement to <em>MFA only</em> or{" "}
          <em>MFA + Full KYC</em> would lock out withdrawals entirely — not just gate them.
          Prefer <em>None</em> or <em>Full KYC only</em> until that&apos;s fixed.
        </div>

        <div className="mt-3 flex items-center gap-3">
          <RequirementSelect value={globalValue} onChange={setGlobalValue} disabled={savingGlobal} />
          <Button onClick={saveGlobal} disabled={savingGlobal || globalValue === globalRequirement} loading={savingGlobal}>
            Save default
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">Per-user override</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Search by name or phone to set a requirement for one specific member, overriding the
          platform-wide default for them only.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Name or phone"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <Button variant="secondary" onClick={search} disabled={searching} loading={searching}>
            Search
          </Button>
        </div>

        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            <RequirementSelect value={overrideChoice} onChange={setOverrideChoice} />
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                <div>
                  <p className="font-medium">{r.full_name ?? "Unnamed user"}</p>
                  <p className="text-xs text-foreground/50">
                    {r.phone} {r.identity_verified ? "· KYC verified" : "· KYC not verified"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setOverride(r.id)}
                  disabled={busyUserId === r.id}
                  loading={busyUserId === r.id}
                >
                  Set override
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">Active overrides</h2>
        {overrides.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">No per-user overrides set.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {overrides.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between gap-2 border-b border-black/5 pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{o.full_name ?? "Unnamed user"}</p>
                  <p className="text-xs text-foreground/50">
                    {o.phone} · {REQUIREMENT_LABEL[o.requirement]} · since{" "}
                    {new Date(o.set_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => clearOverride(o.user_id)}
                  disabled={busyUserId === o.user_id}
                  loading={busyUserId === o.user_id}
                >
                  Clear
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
