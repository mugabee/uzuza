import { createAdminClient } from "../../../../lib/supabase/admin";
import { getRequestToPayStatus } from "../../../../lib/momo-collections";
import { getTransferStatus } from "../../../../lib/momo-disbursements";

// Only recent activity is checked each run — real reconciliation risk is
// concentrated in payments that never got a terminal status recorded,
// and those show up quickly. Checking every historical row against a
// rate-limited external API every single day doesn't scale and isn't
// where the actual risk is.
const LOOKBACK_DAYS = 7;
const STUCK_PENDING_HOURS = 1;

/**
 * Daily automated reconciliation between Uzuza's internal payment
 * records and MTN MoMo's real transaction status — CLAUDE.md Section
 * 3.7 and the unmatched-payments internal page both name this a
 * post-launch item; this is that. Sandbox-only, same status as every
 * other MoMo integration in this app.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(Date.now() - STUCK_PENDING_HOURS * 60 * 60 * 1000).toISOString();

  const summary = { checked: 0, autoResolved: 0, flagged: 0, errors: 0 };

  async function flag(
    source: "contribution" | "wallet_topup" | "wallet_withdrawal",
    sourceId: string,
    referenceId: string,
    type: "missing_confirmation" | "false_confirmation" | "phantom_debit" | "stuck_pending",
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
    if (autoResolved) summary.autoResolved += 1;
    else summary.flagged += 1;
  }

  // --- MoMo Collections contributions ---
  const { data: contributions } = await supabase
    .from("contributions")
    .select("id, amount, status, collection_reference_id, created_at")
    .eq("payment_channel", "momo_collections")
    .not("collection_reference_id", "is", null)
    .in("status", ["submitted", "confirmed"])
    .gte("created_at", since);

  for (const c of contributions ?? []) {
    summary.checked += 1;
    try {
      const momo = await getRequestToPayStatus(c.collection_reference_id!);
      if (c.status === "submitted" && momo.status === "SUCCESSFUL") {
        const { error } = await supabase.rpc("momo_confirm_contribution", {
          p_contribution_id: c.id,
          p_reference_id: c.collection_reference_id,
        });
        await flag("contribution", c.id, c.collection_reference_id!, "missing_confirmation", c.status, momo.status, Number(c.amount), !error);
      } else if (c.status === "confirmed" && momo.status === "FAILED") {
        await flag("contribution", c.id, c.collection_reference_id!, "false_confirmation", c.status, momo.status, Number(c.amount), false);
      } else if (c.status === "submitted" && momo.status === "PENDING" && c.created_at < stuckCutoff) {
        await flag("contribution", c.id, c.collection_reference_id!, "stuck_pending", c.status, momo.status, Number(c.amount), false);
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`reconcile-momo: contribution ${c.id} check failed`, err);
    }
  }

  // --- Wallet top-ups ---
  const { data: topups } = await supabase
    .from("wallet_transactions")
    .select("id, amount, status, collection_reference_id, created_at")
    .eq("type", "topup")
    .not("collection_reference_id", "is", null)
    .in("status", ["pending", "completed"])
    .gte("created_at", since);

  for (const t of topups ?? []) {
    summary.checked += 1;
    try {
      const momo = await getRequestToPayStatus(t.collection_reference_id!);
      if (t.status === "pending" && momo.status === "SUCCESSFUL") {
        const { error } = await supabase.rpc("momo_confirm_wallet_topup", {
          p_transaction_id: t.id,
          p_reference_id: t.collection_reference_id,
        });
        await flag("wallet_topup", t.id, t.collection_reference_id!, "missing_confirmation", t.status, momo.status, Number(t.amount), !error);
      } else if (t.status === "completed" && momo.status === "FAILED") {
        await flag("wallet_topup", t.id, t.collection_reference_id!, "false_confirmation", t.status, momo.status, Number(t.amount), false);
      } else if (t.status === "pending" && momo.status === "PENDING" && t.created_at < stuckCutoff) {
        await flag("wallet_topup", t.id, t.collection_reference_id!, "stuck_pending", t.status, momo.status, Number(t.amount), false);
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`reconcile-momo: wallet topup ${t.id} check failed`, err);
    }
  }

  // --- Wallet withdrawals ---
  const { data: withdrawals } = await supabase
    .from("wallet_transactions")
    .select("id, amount, status, disbursement_reference_id, failure_reason, created_at")
    .eq("type", "withdrawal")
    .not("disbursement_reference_id", "is", null)
    .in("status", ["pending", "completed", "failed"])
    .gte("created_at", since);

  for (const w of withdrawals ?? []) {
    summary.checked += 1;
    try {
      const momo = await getTransferStatus(w.disbursement_reference_id!);

      if (w.status === "pending" && momo.status === "SUCCESSFUL") {
        await supabase.from("wallet_transactions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", w.id);
        await flag("wallet_withdrawal", w.id, w.disbursement_reference_id!, "missing_confirmation", w.status, momo.status, Number(w.amount), true);
      } else if (w.status === "pending" && momo.status === "FAILED") {
        await supabase.from("wallet_transactions").update({ status: "failed", failure_reason: "Reconciliation: MoMo reported this disbursement failed" }).eq("id", w.id);
        await flag("wallet_withdrawal", w.id, w.disbursement_reference_id!, "missing_confirmation", w.status, momo.status, Number(w.amount), true);
      } else if (w.status === "failed" && momo.status === "SUCCESSFUL") {
        // Money actually left Uzuza even though we told the user it
        // failed — their displayed balance no longer reflects this
        // withdrawal, so they could withdraw the same funds again.
        // Never auto-corrected; needs a human to reconcile the balance.
        await flag("wallet_withdrawal", w.id, w.disbursement_reference_id!, "phantom_debit", w.status, momo.status, Number(w.amount), false);
      } else if (w.status === "completed" && momo.status === "FAILED") {
        // We debited the user's balance and told them it succeeded, but
        // the money never actually left — they're owed it back.
        await flag("wallet_withdrawal", w.id, w.disbursement_reference_id!, "false_confirmation", w.status, momo.status, Number(w.amount), false);
      } else if (w.status === "pending" && momo.status === "PENDING" && w.created_at < stuckCutoff) {
        await flag("wallet_withdrawal", w.id, w.disbursement_reference_id!, "stuck_pending", w.status, momo.status, Number(w.amount), false);
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`reconcile-momo: wallet withdrawal ${w.id} check failed`, err);
    }
  }

  return Response.json(summary);
}
