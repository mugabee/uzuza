import { createAdminClient } from "@/lib/supabase/admin";
import { disburse } from "@/lib/momo-disbursements";

/**
 * Automated sweep-out job — CLAUDE.md Section 3.5's "not human-triggered"
 * requirement, taken literally. Runs on a schedule (see vercel.json), not
 * a button anyone clicks. Sandbox-only: see the migration header comment
 * in 20260806210000_phase7_custody.sql — this must not carry real money
 * until the legal review in CLAUDE.md's Phase 7 status note is done.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  // payout_requests has two FKs to groups (group_id and event_group_id),
  // so the embed must name the constraint explicitly — the generic
  // "groups!inner(...)" syntax is ambiguous between them.
  const { data: payouts, error } = await supabase
    .from("payout_requests")
    .select(
      "id, group_id, recipient_user_id, amount, groups!payout_requests_group_id_fkey!inner(account_type)",
    )
    .eq("status", "approved")
    .is("swept_at", null)
    .eq("groups.account_type", "uzuza_held");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};

  for (const payout of payouts ?? []) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", payout.recipient_user_id)
        .single();

      if (!profile?.phone) {
        results[payout.id] = "skipped: recipient has no phone on file";
        continue;
      }

      const msisdn = profile.phone.replace(/^\+/, "");
      const referenceId = crypto.randomUUID();

      const transfer = await disburse({
        referenceId,
        amount: Number(payout.amount),
        recipientMsisdn: msisdn,
        payerMessage: "Uzuza payout",
        payeeNote: "Uzuza automated sweep-out",
      });

      if (transfer.status !== "SUCCESSFUL") {
        results[payout.id] = `failed: disbursement status ${transfer.status}`;
        continue;
      }

      const now = new Date().toISOString();

      await supabase
        .from("payout_requests")
        .update({
          status: "completed",
          transaction_id: transfer.financialTransactionId ?? referenceId,
          completed_at: now,
          swept_at: now,
        })
        .eq("id", payout.id);

      await supabase
        .from("custody_ledger")
        .update({ swept_at: now, swept_reference: referenceId })
        .eq("group_id", payout.group_id)
        .is("swept_at", null);

      results[payout.id] = "swept";
    } catch (err) {
      results[payout.id] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return Response.json({ processed: Object.keys(results).length, results });
}
