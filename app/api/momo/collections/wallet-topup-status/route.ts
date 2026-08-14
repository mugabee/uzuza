import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { getRequestToPayStatus } from "../../../../../lib/momo-collections";

/**
 * Polled while waiting for the top-up's Request to Pay to be approved.
 * Never trusts a client-supplied status — always re-checks with MTN, and
 * only ever confirms via momo_confirm_wallet_topup (service-role-gated).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const transactionId = body?.transactionId as string | undefined;
  const referenceId = body?.referenceId as string | undefined;
  if (!transactionId || !referenceId) {
    return NextResponse.json({ error: "transactionId and referenceId are required" }, { status: 400 });
  }

  const { data: transaction } = await supabase
    .from("wallet_transactions")
    .select("id, status, collection_reference_id")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!transaction || transaction.collection_reference_id !== referenceId) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (transaction.status === "completed") {
    return NextResponse.json({ status: "completed" });
  }
  if (transaction.status === "failed") {
    return NextResponse.json({ status: "failed" });
  }

  let momoStatus: string;
  try {
    const result = await getRequestToPayStatus(referenceId);
    momoStatus = result.status;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 502 },
    );
  }

  const admin = createAdminClient();

  if (momoStatus === "SUCCESSFUL") {
    const { error } = await admin.rpc("momo_confirm_wallet_topup", {
      p_transaction_id: transactionId,
      p_reference_id: referenceId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ status: "completed" });
  }

  if (momoStatus === "FAILED") {
    await admin
      .from("wallet_transactions")
      .update({ status: "failed", failure_reason: "Declined or timed out" })
      .eq("id", transactionId);
    return NextResponse.json({ status: "failed" });
  }

  return NextResponse.json({ status: "pending" });
}
