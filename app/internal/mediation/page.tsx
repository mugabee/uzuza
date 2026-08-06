import { requireStaff } from "@/lib/staff-check";
import { MediationQueueClient } from "@/components/internal/MediationQueueClient";

export default async function InternalMediationPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("list_mediation_cases");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Mediation Queue
      </h1>
      <MediationQueueClient cases={data ?? []} />
    </div>
  );
}
