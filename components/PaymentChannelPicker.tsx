"use client";

import { useEffect, useState } from "react";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { SUPPORTED_CURRENCIES } from "../lib/currencies";
import type { InternationalProofFormInput } from "../lib/validation";

const CHANNELS = [
  {
    value: "momo_manual" as const,
    icon: "📱",
    title: "Rwanda MoMo",
    subtitle: "MTN or Airtel",
  },
  {
    value: "international_manual" as const,
    icon: "🏦",
    title: "Bank / Wise",
    subtitle: "Wire from abroad",
  },
  {
    value: "momo_remittance" as const,
    icon: "🌍",
    title: "MTN Remittance",
    subtitle: "Via a remittance partner",
  },
];

export function PaymentChannelPicker({
  register,
  watch,
  setValue,
  rwfAmount,
}: {
  register: UseFormRegister<InternationalProofFormInput>;
  watch: UseFormWatch<InternationalProofFormInput>;
  setValue: UseFormSetValue<InternationalProofFormInput>;
  rwfAmount: number;
}) {
  const channel = watch("paymentChannel") ?? "momo_manual";
  const currency = watch("payerCurrency") ?? "RWF";
  const isInternational = channel !== "momo_manual";
  const [fx, setFx] = useState<{ converted: number | null; loading: boolean }>({
    converted: null,
    loading: false,
  });

  useEffect(() => {
    if (!isInternational || !currency || currency === "RWF") {
      setFx({ converted: null, loading: false });
      return;
    }
    let cancelled = false;
    setFx({ converted: null, loading: true });
    fetch(`/api/fx?currency=${currency}&rwfAmount=${rwfAmount}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setFx({ converted: data.converted ?? null, loading: false });
        if (data.converted != null) setValue("payerAmount", data.converted);
      })
      .catch(() => {
        if (!cancelled) setFx({ converted: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, isInternational, rwfAmount]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          How are you sending this?
        </span>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setValue("paymentChannel", c.value);
                if (c.value === "momo_manual") {
                  setValue("payerCurrency", "RWF");
                } else if (currency === "RWF") {
                  setValue("payerCurrency", SUPPORTED_CURRENCIES[0].code);
                }
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all duration-150 ${
                channel === c.value
                  ? "border-primary bg-primary/5 shadow-[var(--shadow-soft)]"
                  : "border-border hover:border-black/20"
              }`}
            >
              <span className="text-xl">{c.icon}</span>
              <span className="text-xs font-semibold text-foreground">{c.title}</span>
              <span className="text-[10px] leading-tight text-foreground/50">
                {c.subtitle}
              </span>
            </button>
          ))}
        </div>
        <div
          title="Coming soon"
          className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-foreground/30"
        >
          🔒 Card / bank gateway — coming soon
        </div>
      </div>

      {isInternational && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-secondary p-3 animate-fade-slide-down">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Sending from</span>
            <select
              className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
              {...register("payerCurrency")}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code} — {c.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-soft)]">
            <span className="text-foreground/60">≈ estimated cost</span>
            <span className="font-semibold text-primary">
              {fx.loading
                ? "calculating..."
                : fx.converted != null
                  ? `${fx.converted.toLocaleString()} ${currency}`
                  : "rate unavailable"}
            </span>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">
              Amount you actually sent ({currency})
            </span>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
              {...register("payerAmount")}
            />
          </label>

          <p className="text-xs text-foreground/50">
            {channel === "momo_remittance"
              ? "Send via an MTN Mobile Money remittance partner using the number and reference shown above, then submit proof below."
              : "Wire or Wise to the group's account (ask the admin for details if you don't have them), using the reference below, then submit proof."}
          </p>
        </div>
      )}
    </div>
  );
}
