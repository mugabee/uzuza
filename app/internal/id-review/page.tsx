import { requireStaff } from "@/lib/staff-check";
import { IdReviewClient } from "@/components/internal/IdReviewClient";

export default async function InternalIdReviewPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("list_id_verification_requests");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        ID Verification Review
      </h1>
      <IdReviewClient requests={data ?? []} />
    </div>
  );
}
