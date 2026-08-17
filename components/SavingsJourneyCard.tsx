"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useBalanceHidden } from "../lib/prefs";

export function SavingsJourneyCard({
  totalSaved,
  cyclesCompleted,
  currentStreak,
  groupsCount,
  walletBalance,
}: {
  totalSaved: number;
  cyclesCompleted: number;
  currentStreak: number;
  groupsCount: number;
  walletBalance: number;
}) {
  const [hidden, toggleHidden] = useBalanceHidden();

  return (
    <div
      className="rounded-3xl p-6 text-primary-foreground shadow-[0_1px_2px_rgba(26,95,74,0.15),0_12px_28px_-8px_rgba(26,95,74,0.35)]"
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--primary) 0%, var(--primary) 55%, color-mix(in srgb, var(--primary) 80%, black) 100%)",
      }}
    >
      {/* Available balance is the primary figure on this card — the one
          question most users open the app to answer ("how much can I
          actually use right now") — with a clear "Spendable now" badge
          rather than relying only on caption text to distinguish it
          from the historical total below. */}
      <Link
        href="/wallet"
        className="block rounded-2xl bg-white/10 px-4 py-3.5 transition-colors duration-150 hover:bg-white/15"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Spendable now
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-white/60">
              Available balance
            </p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight">
              {hidden ? (
                <span aria-label="Balance hidden">••••••</span>
              ) : (
                <AnimatedNumber value={walletBalance} />
              )}
              <span className="ml-1.5 text-base font-medium text-white/70">RWF</span>
            </p>
            <p className="mt-0.5 text-[11px] text-white/40">Top up, withdraw, or send</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              toggleHidden();
            }}
            aria-label={hidden ? "Show balance" : "Hide balance"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
      </Link>

      {/* Total saved lifetime is a clearly separate, historical figure —
          smaller, muted, and explicitly badged "Lifetime" so it never
          reads as more money the user could spend on top of the balance
          above. Not a link: unlike the balance, there's no "manage"
          action for a historical total. */}
      <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              Lifetime
            </span>
          </div>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-white/50">
            Total saved
          </p>
          <p className="mt-0.5 text-lg font-semibold text-white/80">
            {hidden ? (
              <span aria-label="Balance hidden">••••</span>
            ) : (
              <AnimatedNumber value={totalSaved} />
            )}
            <span className="ml-1 text-xs font-medium text-white/50">RWF</span>
          </p>
          <p className="text-[11px] text-white/40">
            Everything ever contributed, all-time — not money you can spend
          </p>
        </div>
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
