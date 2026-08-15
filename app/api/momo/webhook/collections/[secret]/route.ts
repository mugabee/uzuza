import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { reconcileContribution, reconcileWalletTopup } from "../../../../../../lib/momo-reconcile";

/**
 * Receives MTN MoMo's push notification once a Collections Request to
 * Pay resolves (see X-Callback-Url in lib/momo-collections.ts). This is
 * purely a "go check now" trigger, not a source of truth — the callback
 * body's own claimed status is never trusted or even read, since MTN's
 * callback delivery isn't signed the way e.g. Standard Webhooks is,
 * meaning anyone who learned this URL could POST an arbitrary body.
 * Instead, the reference ID from the URL is used to ask MTN's own
 * authenticated status endpoint what actually happened, and that real
 * status is what gets applied — through the exact same confirm RPCs
 * (and the exact same never-auto-resolve-a-disagreement safety rule)
 * that both manual polling and the nightly reconciliation cron use. That
 * also makes delivery order and duplicate/retried callbacks irrelevant:
 * whichever one arrives, the handler acts on whatever the real status
 * is at the moment it's asked, not on anything the callback itself said.
 *
 * Always returns 200 once the secret checks out, even if nothing needed
 * to change — MTN retries callbacks that don't get a clean response,
 * and every path here is idempotent, so there's no reason to invite
 * retries.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ secret: string }> }) {
  const { secret } = await context.params;
  const expected = process.env.MOMO_CALLBACK_SECRET;
  if (!expected || secret !== expected) {
    // 404, not 401 — doesn't confirm to a prober that this path exists
    // at all under a different secret.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const ref = url.searchParams.get("ref");
  if (!source || !ref) {
    return NextResponse.json({ error: "Missing source/ref" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    if (source === "contribution") {
      const { data: row } = await supabase
        .from("contributions")
        .select("id, amount, status")
        .eq("collection_reference_id", ref)
        .eq("payment_channel", "momo_collections")
        .maybeSingle();
      if (row) {
        await reconcileContribution(supabase, { ...row, collection_reference_id: ref });
      }
    } else if (source === "topup") {
      const { data: row } = await supabase
        .from("wallet_transactions")
        .select("id, amount, status")
        .eq("collection_reference_id", ref)
        .eq("type", "topup")
        .maybeSingle();
      if (row) {
        await reconcileWalletTopup(supabase, { ...row, collection_reference_id: ref });
      }
    } else if (source === "pledge") {
      // Event pledges use the same "confirmed"/"cancelled" pattern as
      // the public status-poll route (app/api/momo/collections/status),
      // guarded the same way — WHERE status = 'submitted' on the write.
      const { data: row } = await supabase
        .from("event_pledges")
        .select("id, status")
        .eq("collection_reference_id", ref)
        .maybeSingle();
      if (row && row.status === "submitted") {
        const { getRequestToPayStatus } = await import("../../../../../../lib/momo-collections");
        const momo = await getRequestToPayStatus(ref);
        if (momo.status === "SUCCESSFUL") {
          await supabase
            .from("event_pledges")
            .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("status", "submitted");
        } else if (momo.status === "FAILED") {
          await supabase
            .from("event_pledges")
            .update({ status: "cancelled" })
            .eq("id", row.id)
            .eq("status", "submitted");
        }
      }
    }
  } catch (err) {
    // Never fail the webhook response over this — the nightly
    // reconciliation cron will pick up anything missed here, exactly
    // as if the callback had never arrived at all.
    console.error(`momo webhook (collections/${source}): reconciliation check failed for ref ${ref}`, err);
  }

  return NextResponse.json({ ok: true });
}
