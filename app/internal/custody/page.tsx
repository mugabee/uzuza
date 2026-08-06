import { requireStaff } from "@/lib/staff-check";
import { Card } from "@/components/Card";

type SweepEntry = { amount: number; swept_at: string };

export default async function InternalCustodyPage() {
  const { supabase } = await requireStaff();

  const { data } = await supabase.rpc("get_custody_overview");
  const overview = Array.isArray(data) ? data[0] : data;
  const heldTotal = Number(overview?.held_total ?? 0);
  const cap = Number(overview?.custody_cap ?? 0);
  const recentSweeps: SweepEntry[] = overview?.recent_sweeps ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Custody Monitor
      </h1>

      <Card>
        <p className="text-2xl font-semibold text-foreground">
          {heldTotal.toLocaleString()} RWF{" "}
          <span className="text-sm font-normal text-foreground/50">
            / {cap.toLocaleString()} RWF cap
          </span>
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/5">
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.min((heldTotal / (cap || 1)) * 100, 100)}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-foreground/50">
          Sweep-out runs daily via the automated cron job (Phase 7 —{" "}
          <code>/api/cron/sweep-out</code>, scheduled once per day, the
          maximum frequency Vercel's Hobby plan allows for cron jobs).
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Recent sweeps
        </h2>
        {recentSweeps.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">No sweeps yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {recentSweeps.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>{Number(s.amount).toLocaleString()} RWF</span>
                <span className="text-foreground/50">
                  {new Date(s.swept_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
