import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestToPayStatus } from "./momo-collections";
import { getTransferStatus } from "./momo-disbursements";

/**
 * Shared reconciliation logic between the internal record Uzuza holds
 * and MTN MoMo's real status for one transaction — used identically by
 * the nightly batch job (app/api/cron/reconcile-momo) and the real-time
 * webhook receivers (app/api/momo/webhook/**). Keeping this in one
 * place means a webhook-triggered check and a cron-triggered check can
 * never drift into applying different rules for the same situation.
 *
 * Every function here follows the same safety split: a status the
 * internal record simply never picked up gets applied automatically,
 * through the exact confirm path a normal payment would use. Anything
 * where the internal record and MoMo actively disagree about whether
 * money already moved is only ever flagged for a human — see
 * supabase/migrations/20260814180000_automated_momo_reconciliation.sql
 * for why: the dangerous case is a withdrawal marked failed that MoMo
 * actually paid out, which is a real "phantom debit" risk (the user's
 * displayed balance would still show that money as theirs to withdraw
 * again) if silently "corrected" automatically.
 */

type DiscrepancyType = "missing_confirmation" | "false_confirmation" | "phantom_debit" | "stuck_pending";

async function flag(
  supabase: SupabaseClient,
  source: "contribution" | "wallet_topup" | "wallet_withdrawal",
  sourceId: string,
  referenceId: string,
  type: DiscrepancyType,
  internalStatus: string,
  momoStatus: string,
  amount: number,
  autoResolved: boolean,
) {
  await supabase.rpc("record_reconciliation_discrepancy", {
    p_source: source,
    p_source_id: sourceId,
    p_reference_id: referenceId,
    p_discrepancy_type: type,
    p_internal_status: internalStatus,
    p_momo_status: momoStatus,
    p_amount: amount,
    p_auto_resolved: autoResolved,
  });
  return autoResolved;
}

export async function reconcileContribution(
  supabase: SupabaseClient,
  row: { id: string; amount: number; status: string; collection_reference_id: string },
): Promise<{ checked: true; autoResolved: boolean; flagged: boolean }> {
  const momo = await getRequestToPayStatus(row.collection_reference_id);

  if (row.status === "submitted" && momo.status === "SUCCESSFUL") {
    const { error } = await supabase.rpc("momo_confirm_contribution", {
      p_contribution_id: row.id,
      p_reference_id: row.collection_reference_id,
    });
    const resolved = await flag(supabase, "contribution", row.id, row.collection_reference_id, "missing_confirmation", row.status, momo.status, Number(row.amount), !error);
    return { checked: true, autoResolved: resolved, flagged: !resolved };
  }
  if (row.status === "confirmed" && momo.status === "FAILED") {
    await flag(supabase, "contribution", row.id, row.collection_reference_id, "false_confirmation", row.status, momo.status, Number(row.amount), false);
    return { checked: true, autoResolved: false, flagged: true };
  }
  return { checked: true, autoResolved: false, flagged: false };
}

export async function reconcileWalletTopup(
  supabase: SupabaseClient,
  row: { id: string; amount: number; status: string; collection_reference_id: string },
): Promise<{ checked: true; autoResolved: boolean; flagged: boolean }> {
  const momo = await getRequestToPayStatus(row.collection_reference_id);

  if (row.status === "pending" && momo.status === "SUCCESSFUL") {
    const { error } = await supabase.rpc("momo_confirm_wallet_topup", {
      p_transaction_id: row.id,
      p_reference_id: row.collection_reference_id,
    });
    const resolved = await flag(supabase, "wallet_topup", row.id, row.collection_reference_id, "missing_confirmation", row.status, momo.status, Number(row.amount), !error);
    return { checked: true, autoResolved: resolved, flagged: !resolved };
  }
  if (row.status === "completed" && momo.status === "FAILED") {
    await flag(supabase, "wallet_topup", row.id, row.collection_reference_id, "false_confirmation", row.status, momo.status, Number(row.amount), false);
    return { checked: true, autoResolved: false, flagged: true };
  }
  return { checked: true, autoResolved: false, flagged: false };
}

export async function reconcileWalletWithdrawal(
  supabase: SupabaseClient,
  row: { id: string; amount: number; status: string; disbursement_reference_id: string },
): Promise<{ checked: true; autoResolved: boolean; flagged: boolean }> {
  const momo = await getTransferStatus(row.disbursement_reference_id);

  if (row.status === "pending" && momo.status === "SUCCESSFUL") {
    await supabase.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", row.id).eq("status", "pending");
    const resolved = await flag(supabase, "wallet_withdrawal", row.id, row.disbursement_reference_id, "missing_confirmation", row.status, momo.status, Number(row.amount), true);
    return { checked: true, autoResolved: resolved, flagged: false };
  }
  if (row.status === "pending" && momo.status === "FAILED") {
    await supabase
      .from("wallet_transactions")
      .update({ status: "failed", failure_reason: "MoMo reported this disbursement failed" })
      .eq("id", row.id)
      .eq("status", "pending");
    const resolved = await flag(supabase, "wallet_withdrawal", row.id, row.disbursement_reference_id, "missing_confirmation", row.status, momo.status, Number(row.amount), true);
    return { checked: true, autoResolved: resolved, flagged: false };
  }
  if (row.status === "failed" && momo.status === "SUCCESSFUL") {
    // Money actually left Uzuza even though we told the user it failed —
    // never auto-corrected, needs a human to reconcile the balance.
    await flag(supabase, "wallet_withdrawal", row.id, row.disbursement_reference_id, "phantom_debit", row.status, momo.status, Number(row.amount), false);
    return { checked: true, autoResolved: false, flagged: true };
  }
  if (row.status === "completed" && momo.status === "FAILED") {
    // We debited the balance and said it succeeded, but the money never
    // actually left — the user is owed it back. Also never auto-corrected.
    await flag(supabase, "wallet_withdrawal", row.id, row.disbursement_reference_id, "false_confirmation", row.status, momo.status, Number(row.amount), false);
    return { checked: true, autoResolved: false, flagged: true };
  }
  return { checked: true, autoResolved: false, flagged: false };
}
