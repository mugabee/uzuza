import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { requestToPay } from "../../../../../lib/momo-collections";
import { buildMomoCallbackUrl } from "../../../../../lib/momo-callback-url";
import { phoneSchema } from "../../../../../lib/validation";

/**
 * Starts a real MTN MoMo Collections Request to Pay for an existing,
 * already-signed-in member's pending contribution — the authenticated
 * counterpart to the anonymous event-pledge flow at
 * app/api/momo/collections/request/route.ts. The member is already known
 * (via their session), so this only needs the phone to charge and confirms
 * the contribution is actually theirs before doing anything.
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
  const contributionId = body?.contributionId as string | undefined;
  const phone = body?.phone as string | undefined;
  if (!contributionId) {
    return NextResponse.json({ error: "contributionId is required" }, { status: 400 });
  }
  const phoneResult = phoneSchema.safeParse(phone);
  if (!phoneResult.success) {
    return NextResponse.json({ error: phoneResult.error.issues[0].message }, { status: 400 });
  }
  const normalizedPhone = phoneResult.data;

  const { data: contribution } = await supabase
    .from("contributions")
    .select("id, amount, member_id, status, group_id")
    .eq("id", contributionId)
    .eq("member_id", user.id)
    .maybeSingle();

  if (!contribution) {
    return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
  }
  if (contribution.status !== "pending") {
    return NextResponse.json({ error: "This contribution isn't awaiting payment" }, { status: 409 });
  }

  const referenceId = crypto.randomUUID();
  const admin = createAdminClient();

  // .select() here isn't just for the return value — without it there's
  // no way to tell a real update (1 row) apart from a no-op (0 rows,
  // because someone else's concurrent request already flipped this
  // contribution out of "pending" first). Without that check, a
  // double-click could lose this race silently and still go on to
  // fire a second real MTN charge prompt for the same contribution.
  const { data: updated, error: updateError } = await admin
    .from("contributions")
    .update({
      status: "submitted",
      payment_channel: "momo_collections",
      collection_reference_id: referenceId,
      payer_phone: normalizedPhone,
      payer_currency: "RWF",
      payer_amount: contribution.amount,
      submitted_at: new Date().toISOString(),
      transaction_id: referenceId,
    })
    .eq("id", contributionId)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "This contribution isn't awaiting payment" }, { status: 409 });
  }

  try {
    await requestToPay({
      referenceId,
      amount: Number(contribution.amount),
      payerMsisdn: normalizedPhone.replace(/^\+/, ""),
      payerMessage: "Uzuza contribution",
      payeeNote: "Uzuza contribution",
      callbackUrl: buildMomoCallbackUrl("collections", "contribution", referenceId),
    });
  } catch (err) {
    await admin
      .from("contributions")
      .update({ status: "pending", payment_channel: "momo_manual", collection_reference_id: null, transaction_id: null, submitted_at: null })
      .eq("id", contributionId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the payment request" },
      { status: 502 },
    );
  }

  return NextResponse.json({ contributionId, referenceId });
}
