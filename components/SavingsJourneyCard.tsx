import { Card } from "@/components/Card";

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
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Your savings journey
      </h2>
      <p className="mt-3 text-2xl font-semibold text-foreground">
        {totalSaved.toLocaleString()} RWF
        <span className="ml-2 text-sm font-normal text-foreground/50">
          saved lifetime
        </span>
      </p>
      <dl className="mt-4 flex gap-6 text-sm">
        <div>
          <dt className="text-foreground/50">Cycles completed</dt>
          <dd className="font-medium text-foreground">{cyclesCompleted}</dd>
        </div>
        <div>
          <dt className="text-foreground/50">Streak</dt>
          <dd className="font-medium text-foreground">{currentStreak}</dd>
        </div>
        <div>
          <dt className="text-foreground/50">Groups</dt>
          <dd className="font-medium text-foreground">{groupsCount}</dd>
        </div>
      </dl>
    </Card>
  );
}
