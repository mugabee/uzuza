import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { disburse } from "../../../../../lib/momo-disbursements";
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

  const { id: transactionId, reference } = withdrawal as { id: string; reference: string };
  const admin = createAdminClient();

  try {
    const transfer = await disburse({
      referenceId: reference,
      amount,
      recipientMsisdn: normalizedPhone.replace(/^\+/, ""),
      payerMessage: "Uzuza wallet withdrawal",
      payeeNote: "Uzuza wallet withdrawal",
    });

    if (transfer.status !== "SUCCESSFUL") {
      await admin
        .from("wallet_transactions")
        .update({ status: "failed", failure_reason: `Disbursement status: ${transfer.status}` })
        .eq("id", transactionId);
      return NextResponse.json({ error: `Withdrawal was not completed (${transfer.status})` }, { status: 502 });
    }

    await admin
      .from("wallet_transactions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", transactionId);
    await admin.rpc("log_audit_event", {
      p_action: "wallet_withdrawal_completed",
      p_entity_type: "wallet_transaction",
      p_entity_id: transactionId,
      p_metadata: { amount },
    });

    return NextResponse.json({ transactionId, status: "completed" });
  } catch (err) {
    await admin
      .from("wallet_transactions")
      .update({ status: "failed", failure_reason: err instanceof Error ? err.message : "Disbursement failed" })
      .eq("id", transactionId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not complete the withdrawal" },
      { status: 502 },
    );
  }
}
