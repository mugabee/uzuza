import { createAdminClient } from "../../../../lib/supabase/admin";

/**
 * Automated sweep-out job — CLAUDE.md Section 3.5's "not human-triggered"
 * requirement, taken literally. Runs on a schedule (see vercel.json), not
 * a button anyone clicks. Sandbox-only: see the migration header comment
 * in 20260806210000_phase7_custody.sql — this must not carry real money
 * until the legal review in CLAUDE.md's Phase 7 status note is done.
 *
 * Credits the recipient's personal Uzuza wallet rather than disbursing
 * straight to their phone — the money is still fully re-attributed out
 * of the group's custody position (same as before), it just now shows up
 * as spendable wallet balance the user can see and withdraw on their own
 * terms, instead of a payout that "completed" with nothing to show for
 * it inside the app. See 20260814140000_uzuza_held_payouts_credit_wallet.sql.
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
    .eq("groups.account_type", "uzuza_held");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};

  for (const payout of payouts ?? []) {
    try {
      const { error: sweepError } = await supabase.rpc("sweep_uzuza_held_payout_to_wallet", {
        p_payout_request_id: payout.id,
      });

      if (sweepError) {
        results[payout.id] = `error: ${sweepError.message}`;
        continue;
      }

      results[payout.id] = "credited to wallet";
    } catch (err) {
      results[payout.id] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return Response.json({ processed: Object.keys(results).length, results });
}
