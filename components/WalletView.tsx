"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { AnimatedNumber } from "@/components/AnimatedNumber";

type Transaction = {
  kind: string;
  direction: "in" | "out";
  amount: number;
  group_name: string;
  group_id: string;
  occurred_at: string | null;
};

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
] as const;

const KIND_ICON: Record<string, { bg: string; icon: string }> = {
  "Payout received": { bg: "bg-blue-500/15 text-blue-600", icon: "↓" },
  Contribution: { bg: "bg-red-500/15 text-red-600", icon: "↑" },
  "Event pledge": { bg: "bg-pink-500/15 text-pink-600", icon: "↑" },
  "Reservation fee": { bg: "bg-orange-500/15 text-orange-600", icon: "↑" },
};

export function WalletView({ transactions }: { transactions: Transaction[] }) {
  const [tab, setTab] = useState<"overview" | "transactions">("overview");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("7d");
  const [summary, setSummary] = useState<{ money_received: number; money_sent: number } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem("uzuza_balance_hidden") === "on");
  }, []);

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    localStorage.setItem("uzuza_balance_hidden", next ? "on" : "off");
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_wallet_summary", { p_period: period });
      const row = data?.[0];
      if (!cancelled && row) {
        setSummary({ money_received: Number(row.money_received), money_sent: Number(row.money_sent) });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const net = summary ? summary.money_received - summary.money_sent : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1 rounded-full bg-surface-secondary p-1 text-sm font-medium">
        {(["overview", "transactions"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 capitalize transition-all duration-200 ${
              tab === key
                ? "bg-surface text-primary shadow-[var(--shadow-soft)]"
                : "text-foreground/60 hover:text-foreground/80"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <div
            className="rounded-3xl p-6 text-primary-foreground shadow-[0_1px_2px_rgba(26,95,74,0.15),0_12px_28px_-8px_rgba(26,95,74,0.35)]"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--primary) 0%, var(--primary) 55%, color-mix(in srgb, var(--primary) 80%, black) 100%)",
            }}
          >
            <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3.5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Net this period
                </p>
                <p className="mt-1 font-display text-3xl font-bold tracking-tight">
                  {hidden ? (
                    <span aria-label="Balance hidden">••••••</span>
                  ) : (
                    <AnimatedNumber value={net} />
                  )}
                  <span className="ml-1.5 text-base font-medium text-white/70">RWF</span>
                </p>
              </div>
              <button
                type="button"
                onClick={toggleHidden}
                aria-label={hidden ? "Show balance" : "Hide balance"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                {hidden ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
                    <path d="M9.88 4.24A9.5 9.5 0 0 1 12 4c5.5 0 9.5 5 9.5 8-.32.9-.85 1.86-1.56 2.78M6.6 6.6C4.2 8.1 2.5 10.4 2.5 12c0 3 4 8 9.5 8 1.4 0 2.7-.32 3.85-.87" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 12S6.5 4 12 4s9.5 8 9.5 8-4 8-9.5 8-9.5-8-9.5-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <div className="mt-4 flex gap-1 rounded-full bg-white/10 p-1 text-xs font-medium">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`flex-1 rounded-full py-1.5 transition-all duration-200 ${
                    period === p.key ? "bg-white/25 text-white" : "text-white/60 hover:text-white/80"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <h2 className="font-display text-lg font-semibold text-primary">Activity</h2>
            <div className="mt-3 flex flex-col divide-y divide-border">
              <div className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
                  ↓
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">Money received</span>
                <span className="text-sm font-semibold text-foreground">
                  {hidden ? "••••" : `${(summary?.money_received ?? 0).toLocaleString()} RWF`}
                </span>
              </div>
              <div className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-600">
                  ↑
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">Money sent</span>
                <span className="text-sm font-semibold text-foreground">
                  {hidden ? "••••" : `${(summary?.money_sent ?? 0).toLocaleString()} RWF`}
                </span>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-2">
          {transactions.length === 0 ? (
            <p className="py-10 text-center text-sm text-foreground/50">
              You don't have any transactions yet :)
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {transactions.map((t, i) => {
                const style = KIND_ICON[t.kind] ?? { bg: "bg-foreground/10 text-foreground/60", icon: "•" };
                return (
                  <li key={i} className="flex items-center gap-3 px-2 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.bg}`}>
                      {style.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{t.kind}</p>
                      <p className="truncate text-xs text-foreground/50">
                        {t.group_name}
                        {t.occurred_at ? ` · ${new Date(t.occurred_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${t.direction === "in" ? "text-blue-600" : "text-red-600"}`}>
                      {hidden ? "••••" : `${t.direction === "in" ? "+" : "-"}${Number(t.amount).toLocaleString()}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
