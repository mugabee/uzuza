import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestToPayStatus } from "@/lib/momo-collections";

/**
 * Polled by the contribute page while waiting for the member to approve
 * (or decline) the Request to Pay prompt. Never trusts a client-supplied
 * status — always re-checks with MTN directly, and only ever confirms via
 * momo_confirm_contribution (service-role-gated), so a client can't fake
 * success by calling this with a made-up "SUCCESSFUL" body.
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
  const referenceId = body?.referenceId as string | undefined;
  if (!contributionId || !referenceId) {
    return NextResponse.json({ error: "contributionId and referenceId are required" }, { status: 400 });
  }

  const { data: contribution } = await supabase
    .from("contributions")
    .select("id, status, collection_reference_id")
    .eq("id", contributionId)
    .eq("member_id", user.id)
    .maybeSingle();

  if (!contribution || contribution.collection_reference_id !== referenceId) {
    return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
  }

  if (contribution.status === "confirmed") {
    return NextResponse.json({ status: "confirmed" });
  }
  if (contribution.status === "pending") {
    // Already bounced back by a previous failed check.
    return NextResponse.json({ status: "cancelled" });
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
    const { error } = await admin.rpc("momo_confirm_contribution", {
      p_contribution_id: contributionId,
      p_reference_id: referenceId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ status: "confirmed" });
  }

  if (momoStatus === "FAILED") {
    await admin
      .from("contributions")
      .update({
        status: "pending",
        payment_channel: "momo_manual",
        collection_reference_id: null,
        transaction_id: null,
        submitted_at: null,
      })
      .eq("id", contributionId);
    return NextResponse.json({ status: "cancelled" });
  }

  return NextResponse.json({ status: "pending" });
}
