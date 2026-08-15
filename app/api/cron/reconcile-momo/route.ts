import { createAdminClient } from "../../../../lib/supabase/admin";
import { reconcileContribution, reconcileWalletTopup, reconcileWalletWithdrawal } from "../../../../lib/momo-reconcile";

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
 *
 * This is the batch-scan safety net that runs regardless of whether
 * the real-time webhooks (app/api/momo/webhook/**) actually fire —
 * sandbox callback delivery isn't guaranteed, and even in production a
 * webhook can be lost. The actual per-transaction logic lives in
 * lib/momo-reconcile.ts, shared with the webhook receivers, so both
 * paths apply identical rules.
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

  function record(result: { autoResolved: boolean; flagged: boolean }) {
    summary.checked += 1;
    if (result.autoResolved) summary.autoResolved += 1;
    if (result.flagged) summary.flagged += 1;
  }

  async function flagStuck(
    source: "contribution" | "wallet_topup" | "wallet_withdrawal",
    sourceId: string,
    referenceId: string,
    internalStatus: string,
    amount: number,
  ) {
    await supabase.rpc("record_reconciliation_discrepancy", {
      p_source: source,
      p_source_id: sourceId,
      p_reference_id: referenceId,
      p_discrepancy_type: "stuck_pending",
      p_internal_status: internalStatus,
      p_momo_status: "PENDING",
      p_amount: amount,
      p_auto_resolved: false,
    });
    summary.flagged += 1;
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
    try {
      const result = await reconcileContribution(supabase, {
        id: c.id,
        amount: c.amount,
        status: c.status,
        collection_reference_id: c.collection_reference_id!,
      });
      record(result);
      if (!result.autoResolved && !result.flagged && c.status === "submitted" && c.created_at < stuckCutoff) {
        await flagStuck("contribution", c.id, c.collection_reference_id!, c.status, Number(c.amount));
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
    try {
      const result = await reconcileWalletTopup(supabase, {
        id: t.id,
        amount: t.amount,
        status: t.status,
        collection_reference_id: t.collection_reference_id!,
      });
      record(result);
      if (!result.autoResolved && !result.flagged && t.status === "pending" && t.created_at < stuckCutoff) {
        await flagStuck("wallet_topup", t.id, t.collection_reference_id!, t.status, Number(t.amount));
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`reconcile-momo: wallet topup ${t.id} check failed`, err);
    }
  }

  // --- Wallet withdrawals ---
  const { data: withdrawals } = await supabase
    .from("wallet_transactions")
    .select("id, amount, status, disbursement_reference_id, created_at")
    .eq("type", "withdrawal")
    .not("disbursement_reference_id", "is", null)
    .in("status", ["pending", "completed", "failed"])
    .gte("created_at", since);

  for (const w of withdrawals ?? []) {
    try {
      const result = await reconcileWalletWithdrawal(supabase, {
        id: w.id,
        amount: w.amount,
        status: w.status,
        disbursement_reference_id: w.disbursement_reference_id!,
      });
      record(result);
      if (!result.autoResolved && !result.flagged && w.status === "pending" && w.created_at < stuckCutoff) {
        await flagStuck("wallet_withdrawal", w.id, w.disbursement_reference_id!, w.status, Number(w.amount));
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`reconcile-momo: wallet withdrawal ${w.id} check failed`, err);
    }
  }

  return Response.json(summary);
}
