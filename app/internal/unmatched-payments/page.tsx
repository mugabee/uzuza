import { requireStaff } from "@/lib/staff-check";
import { UnmatchedPaymentsClient } from "@/components/internal/UnmatchedPaymentsClient";

export default async function InternalUnmatchedPaymentsPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase
    .from("unmatched_payments")
    .select("id, description, amount, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Unmatched Payments
      </h1>
      <p className="max-w-lg text-xs text-foreground/50">
        Manual tracking for payments staff notice that didn't match any
        known reference. Automated bank/MoMo statement reconciliation is a
        post-launch item, per the plan — this is the interim manual flow.
      </p>
      <UnmatchedPaymentsClient payments={data ?? []} />
    </div>
  );
}
