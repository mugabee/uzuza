import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestToPay } from "@/lib/momo-collections";
import { phoneSchema } from "@/lib/validation";

/**
 * Starts a real MTN MoMo Collections Request to Pay to top up the
 * signed-in user's personal Uzuza wallet. Same sandbox-only status as
 * every other MoMo integration in this app — see the wallet migration's
 * header note for why this exists and what it deliberately doesn't do
 * yet (production credentials, real fund movement).
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

  const referenceId = crypto.randomUUID();

  const { data: transactionId, error: initError } = await supabase.rpc("initiate_wallet_topup", {
    p_amount: amount,
    p_phone: normalizedPhone,
    p_reference_id: referenceId,
  });

  if (initError) {
    return NextResponse.json({ error: initError.message }, { status: 400 });
  }

  try {
    await requestToPay({
      referenceId,
      amount,
      payerMsisdn: normalizedPhone.replace(/^\+/, ""),
      payerMessage: "Uzuza wallet top-up",
      payeeNote: "Uzuza wallet top-up",
    });
  } catch (err) {
    const admin = createAdminClient();
    await admin
      .from("wallet_transactions")
      .update({ status: "failed", failure_reason: "Could not start the payment request" })
      .eq("id", transactionId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the payment request" },
      { status: 502 },
    );
  }

  return NextResponse.json({ transactionId, referenceId });
}
