import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { requestToPay } from "../../../../../lib/momo-collections";
import { phoneSchema } from "../../../../../lib/validation";

/**
 * Public, no-account-required entry point for an event contribution paid
 * directly via MTN MoMo Collections: someone scans the QR, enters an
 * amount and their phone number, and MTN sends the actual PIN prompt to
 * that phone through their own app/USSD - Uzuza never collects a PIN.
 * Runs entirely server-side with the service-role key so it can silently
 * find-or-create the pledge's owning account without ever showing a
 * sign-in screen. Sandbox only until legal review clears real fund
 * movement (same status as every other MoMo integration in this app).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { groupId, amount, visibility, phone } = body as {
    groupId?: string;
    amount?: number;
    visibility?: "public" | "name_only" | "private";
    phone?: string;
  };

  const phoneResult = phoneSchema.safeParse(phone);
  if (!phoneResult.success) {
    return NextResponse.json({ error: phoneResult.error.issues[0].message }, { status: 400 });
  }
  if (!groupId || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "A group and a positive amount are required" }, { status: 400 });
  }
  const safeVisibility: "public" | "name_only" | "private" =
    visibility === "name_only" || visibility === "private" ? visibility : "public";

  const supabase = createAdminClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, group_type")
    .eq("id", groupId)
    .single();
  if (!group || group.group_type !== "event") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const normalizedPhone = phoneResult.data;

  // Find-or-create the pledge's owning account by phone, without ever
  // exposing a sign-in step to the payer - the Request to Pay approval on
  // their own phone is what actually proves it's their number.
  let pledgerId: string;
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existingProfile) {
    pledgerId = existingProfile.id;
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      phone: normalizedPhone.replace(/^\+/, ""),
      phone_confirm: true,
    });
    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Could not set up an account for this number" },
        { status: 500 },
      );
    }
    pledgerId = created.user.id;
    // The on_auth_user_created trigger already inserted a profiles row
    // using the raw (no "+") phone format - normalize it to match the
    // "+"-prefixed format the rest of the app stores and looks up by.
    await supabase.from("profiles").update({ phone: normalizedPhone }).eq("id", pledgerId);
  }

  const referenceId = crypto.randomUUID();

  const { data: pledge, error: pledgeError } = await supabase
    .from("event_pledges")
    .insert({
      group_id: groupId,
      pledger_id: pledgerId,
      amount,
      visibility: safeVisibility,
      status: "submitted",
      unique_reference: `UZP-${groupId.slice(0, 6)}-${pledgerId.slice(0, 6)}-${referenceId.slice(0, 4)}`,
      transaction_id: referenceId,
      payment_channel: "momo_collections",
      payer_currency: "RWF",
      payer_amount: amount,
      payer_phone: normalizedPhone,
      collection_reference_id: referenceId,
    })
    .select("id")
    .single();

  if (pledgeError || !pledge) {
    return NextResponse.json(
      { error: pledgeError?.message ?? "Could not record the pledge" },
      { status: 500 },
    );
  }

  try {
    await requestToPay({
      referenceId,
      amount,
      payerMsisdn: normalizedPhone.replace(/^\+/, ""),
      payerMessage: `Uzuza event contribution`,
      payeeNote: `Uzuza event contribution`,
    });
  } catch (err) {
    await supabase.from("event_pledges").update({ status: "cancelled" }).eq("id", pledge.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the payment request" },
      { status: 502 },
    );
  }

  return NextResponse.json({ pledgeId: pledge.id, referenceId });
}
