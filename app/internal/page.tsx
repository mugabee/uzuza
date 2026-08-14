import { requireStaff } from "../../lib/staff-check";
import { Card } from "@/components/Card";

type Metrics = {
  active_groups: number;
  active_members: number;
  custody_held: number;
  custody_cap: number;
  open_mediations_financial: number;
  open_mediations_general: number;
  pending_id_reviews: number;
  open_unmatched_payments: number;
};

export default async function InternalMetricsPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("get_platform_metrics");
  const metrics = (Array.isArray(data) ? data[0] : data) as Metrics | undefined;

  const tiles: { label: string; value: string }[] = metrics
    ? [
        { label: "Active groups", value: String(metrics.active_groups) },
        { label: "Active members", value: String(metrics.active_members) },
        {
          label: "Custody held / cap",
          value: `${Number(metrics.custody_held).toLocaleString()} / ${Number(metrics.custody_cap).toLocaleString()} RWF`,
        },
        {
          label: "Open mediations (financial)",
          value: String(metrics.open_mediations_financial),
        },
        {
          label: "Open mediations (general)",
          value: String(metrics.open_mediations_general),
        },
        { label: "Pending ID reviews", value: String(metrics.pending_id_reviews) },
        {
          label: "Open unmatched payments",
          value: String(metrics.open_unmatched_payments),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Platform Metrics
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <p className="text-xs text-foreground/50">{t.label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{t.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
