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
  return (
    <div
      className="rounded-3xl p-6 text-primary-foreground shadow-[0_1px_2px_rgba(26,95,74,0.15),0_12px_28px_-8px_rgba(26,95,74,0.35)]"
      style={{
        backgroundImage:
          "linear-gradient(135deg, #1a5f4a 0%, #1a5f4a 55%, #14493a 100%)",
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-white/60">
        Total saved lifetime
      </p>
      <p className="mt-1 font-display text-4xl font-bold tracking-tight">
        <AnimatedNumber value={totalSaved} />
        <span className="ml-1.5 text-lg font-medium text-white/70">RWF</span>
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            Cycles
          </dt>
          <dd className="mt-0.5 text-lg font-semibold">
            <AnimatedNumber value={cyclesCompleted} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            Streak
          </dt>
          <dd className="mt-0.5 text-lg font-semibold">
            <AnimatedNumber value={currentStreak} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            Groups
          </dt>
          <dd className="mt-0.5 text-lg font-semibold">
            <AnimatedNumber value={groupsCount} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
