"use client";

import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";

export function SavingsJourneyCard({
  totalSaved,
  cyclesCompleted,
  currentStreak,
  groupsCount,
}: {
  totalSaved: number;
  cyclesCompleted: number;
  currentStreak: number;
  groupsCount: number;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem("uzuza_balance_hidden") === "on");
  }, []);

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    localStorage.setItem("uzuza_balance_hidden", next ? "on" : "off");
  }

  return (
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
            Total saved lifetime
          </p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight">
            {hidden ? (
              <span aria-label="Balance hidden">••••••</span>
            ) : (
              <AnimatedNumber value={totalSaved} />
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

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            Cycles
          </dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {hidden ? "••" : <AnimatedNumber value={cyclesCompleted} />}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            Streak
          </dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {hidden ? "••" : <AnimatedNumber value={currentStreak} />}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            Groups
          </dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {hidden ? "••" : <AnimatedNumber value={groupsCount} />}
          </dd>
        </div>
      </dl>
    </div>
  );
}
