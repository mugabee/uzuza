"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

type SafetyFundType = "off" | "buffer" | "freeze";

const OPTIONS: { value: SafetyFundType; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No extra protection, no surcharge." },
  {
    value: "buffer",
    label: "Rolling buffer",
    description: "7.5% surcharge each round, payouts start immediately.",
  },
  {
    value: "freeze",
    label: "Full first-cycle freeze",
    description: "Everyone contributes a full cycle before anyone is paid.",
  },
];

export function SafetyFundEditor({
  groupId,
  currentType,
}: {
  groupId: string;
  currentType: SafetyFundType;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function handleChange(value: SafetyFundType) {
    if (value === currentType) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_safety_fund_type", {
      p_group_id: groupId,
      p_safety_fund_type: value,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Safety fund setting updated");
    router.refresh();
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Safety fund
      </h2>
      <p className="mt-1 text-sm text-foreground/60">
        Protects the group if someone leaves after receiving their payout.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
              currentType === option.value
                ? "border-primary bg-primary/5"
                : "border-black/10"
            }`}
          >
            <input
              type="radio"
              name="safetyFundType"
              className="mt-0.5"
              checked={currentType === option.value}
              disabled={busy}
              onChange={() => handleChange(option.value)}
            />
            <span>
              <span className="font-medium text-foreground">{option.label}</span>
              <span className="block text-xs text-foreground/60">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </Card>
  );
}
