import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { reconcileWalletWithdrawal } from "../../../../../../lib/momo-reconcile";

/**
 * Same design as app/api/momo/webhook/collections/[secret] — a "go
 * check now" trigger, never a trusted payload — for MTN's Disbursements
 * callback. The only caller today is a wallet withdrawal (group payouts
 * on Uzuza-held custody groups credit the recipient's wallet instead of
 * disbursing directly, see 20260814140000_uzuza_held_payouts_credit_wallet.sql,
 * so there's no other real disbursement path left to wire this into).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ secret: string }> }) {
  const { secret } = await context.params;
  const expected = process.env.MOMO_CALLBACK_SECRET;
  if (!expected || secret !== expected) {
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
    if (source === "withdrawal") {
      const { data: row } = await supabase
        .from("wallet_transactions")
        .select("id, amount, status")
        .eq("disbursement_reference_id", ref)
        .eq("type", "withdrawal")
        .maybeSingle();
      if (row) {
        await reconcileWalletWithdrawal(supabase, { ...row, disbursement_reference_id: ref });
      }
    }
  } catch (err) {
    console.error(`momo webhook (disbursements/${source}): reconciliation check failed for ref ${ref}`, err);
  }

  return NextResponse.json({ ok: true });
}
