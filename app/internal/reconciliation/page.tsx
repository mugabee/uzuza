import { requireStaff } from "../../../lib/staff-check";
import { ReconciliationClient } from "@/components/internal/ReconciliationClient";

export default async function InternalReconciliationPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("list_reconciliation_discrepancies", { p_unresolved_only: false });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        MoMo Reconciliation
      </h1>
      <p className="max-w-lg text-xs text-foreground/50">
        A daily job compares Uzuza's internal payment records against MTN MoMo's real transaction
        status for every reference Uzuza generated. Anything MoMo confirms that the internal
        record missed gets self-healed automatically through the same confirm path a normal
        payment uses. Anything where the two disagree about whether money actually moved is never
        auto-resolved — it's flagged here for a person to look at.
      </p>
      <ReconciliationClient discrepancies={data ?? []} />
    </div>
  );
}
