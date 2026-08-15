import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { disburse } from "../../../../../lib/momo-disbursements";
import { buildMomoCallbackUrl } from "../../../../../lib/momo-callback-url";
import { phoneSchema } from "../../../../../lib/validation";

/**
 * Withdraws from the signed-in user's personal Uzuza wallet via a real
 * MTN MoMo Disbursement — a genuine fund-release action, same MFA gate
 * as completing a payout (enforced inside request_wallet_withdrawal).
 * Sandbox-only, same status as every other MoMo integration here.
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
  const amount = body?.amount as number | undefined;
  const phone = body?.phone as string | undefined;
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Enter an amount greater than 0" }, { status: 400 });
  }
  const phoneResult = phoneSchema.safeParse(phone);
  if (!phoneResult.success) {
    return NextResponse.json({ error: phoneResult.error.issues[0].message }, { status: 400 });
  }
  const normalizedPhone = phoneResult.data;

  const { data: withdrawal, error: rpcError } = await supabase
    .rpc("request_wallet_withdrawal", { p_amount: amount, p_phone: normalizedPhone })
    .single();

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  const { id: transactionId, reference, is_new: isNew } = withdrawal as {
    id: string;
    reference: string;
    is_new: boolean;
  };
  const admin = createAdminClient();

  // Not a new attempt — an existing pending withdrawal was reused
  // instead (double-click / retry), so don't fire a second real MTN
  // Disbursement for it. That would be an actual double debit, not just
  // a duplicate row.
  if (!isNew) {
    return NextResponse.json({ transactionId, status: "pending" });
  }

  try {
    const transfer = await disburse({
      referenceId: reference,
      amount,
      recipientMsisdn: normalizedPhone.replace(/^\+/, ""),
      payerMessage: "Uzuza wallet withdrawal",
      payeeNote: "Uzuza wallet withdrawal",
      callbackUrl: buildMomoCallbackUrl("disbursements", "withdrawal", reference),
    });

    if (transfer.status === "FAILED") {
      await admin
        .from("wallet_transactions")
        .update({ status: "failed", failure_reason: "Disbursement status: FAILED" })
        .eq("id", transactionId)
        .eq("status", "pending");
      return NextResponse.json({ error: "Withdrawal was not completed (FAILED)" }, { status: 502 });
    }

    if (transfer.status !== "SUCCESSFUL") {
      // Genuinely still PENDING — MTN Disbursements are asynchronous,
      // so a single synchronous check right after the call isn't
      // authoritative. Marking this "failed" here would be wrong if it
      // later actually succeeds (a real phantom-debit risk — the
      // user's balance would show the money as still theirs to
      // withdraw again while it had already gone out). Leave it
      // pending; the webhook callback above and the nightly
      // reconciliation cron will both resolve it correctly whichever
      // way it actually goes.
      return NextResponse.json({ transactionId, status: "pending" });
    }

    await admin
      .from("wallet_transactions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", transactionId)
      .eq("status", "pending");
    await admin.rpc("log_audit_event", {
      p_action: "wallet_withdrawal_completed",
      p_entity_type: "wallet_transaction",
      p_entity_id: transactionId,
      p_metadata: { amount },
    });

    return NextResponse.json({ transactionId, status: "completed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disbursement failed";
    // Only mark "failed" when the transfer request itself was rejected
    // (disburse() throws this specific message when MTN's initial POST
    // doesn't return 202 — i.e. nothing was ever accepted for
    // processing). Any other error here — most likely the *status
    // check* disburse() does right after — leaves real ambiguity about
    // whether MTN actually accepted and is processing the transfer.
    // Marking "failed" in that case risks the same phantom-debit class
    // of bug: if it later turns out to have succeeded, the user's
    // balance would still show that money as theirs to withdraw again.
    // Leaving it "pending" here means the webhook and the nightly
    // reconciliation cron resolve it correctly either way.
    if (message.startsWith("Disbursement request failed")) {
      await admin
        .from("wallet_transactions")
        .update({ status: "failed", failure_reason: message })
        .eq("id", transactionId)
        .eq("status", "pending");
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not complete the withdrawal" },
      { status: 502 },
    );
  }
}
