import { requireStaff } from "../../../lib/staff-check";
import { FraudFlagsClient } from "@/components/internal/FraudFlagsClient";

export default async function InternalFraudPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("list_fraud_flags", { p_unresolved_only: false });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Fraud & Operational Flags
      </h1>
      <p className="text-sm text-foreground/60">
        Automatic, flag-only monitoring — large wallet transactions, unusually high 24h
        top-up/withdrawal volume per user, shadow-ledger drift, payouts approved but never
        completed, and matching groups stuck &quot;forming&quot; with real reservation money
        already held — all detected by the daily reconciliation cron. None of this blocks a
        transaction or an admin action; it only surfaces here for review.
      </p>
      <FraudFlagsClient flags={data ?? []} />
    </div>
  );
}
