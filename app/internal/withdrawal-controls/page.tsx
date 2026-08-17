import { requireStaff } from "../../../lib/staff-check";
import { WithdrawalControlsClient } from "@/components/internal/WithdrawalControlsClient";

export default async function InternalWithdrawalControlsPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("get_withdrawal_verification_settings").single();
  const settings = data as { global_requirement: string; overrides: unknown[] } | null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Withdrawal Verification Controls
      </h1>
      <WithdrawalControlsClient
        globalRequirement={(settings?.global_requirement as "none" | "mfa" | "kyc" | "both") ?? "none"}
        overrides={(settings?.overrides as never[]) ?? []}
      />
    </div>
  );
}
