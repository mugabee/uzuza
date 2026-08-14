import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { getRequestToPayStatus } from "../../../../../lib/momo-collections";

/**
 * Polled by the public pledge-and-pay page while waiting for the payer to
 * approve (or decline) the Request to Pay prompt on their own phone. A
 * SUCCESSFUL result here is a real, MTN-confirmed payment - stronger
 * proof than the screenshot+transaction-ID the rest of the app relies on
 * for manual payments - so the pledge is auto-confirmed, no admin review
 * step needed.
 */

// Two independent random UUIDs (pledgeId + its matching reference_id) are
// already required to get anything back, so brute-force enumeration is
// impractical - this only needs to stop rapid hammering of one already-known
// pair, not defend against guessing. A per-instance in-memory map is good
// enough for that; it resets on cold start, which is fine for a throttle
// this lightweight (no DB table needed - rate_limit_events requires a real
// auth.uid(), which this anonymous route never has).
const lastCheckedAt = new Map<string, number>();
const MIN_INTERVAL_MS = 1500;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const pledgeId = body?.pledgeId as string | undefined;
  const referenceId = body?.referenceId as string | undefined;
  if (!pledgeId || !referenceId) {
    return NextResponse.json({ error: "pledgeId and referenceId are required" }, { status: 400 });
  }

  const throttleKey = `${pledgeId}:${referenceId}`;
  const now = Date.now();
  const last = lastCheckedAt.get(throttleKey);
  if (last && now - last < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: "Checking too frequently — please wait a moment" }, { status: 429 });
  }
  lastCheckedAt.set(throttleKey, now);

  const supabase = createAdminClient();

  const { data: pledge } = await supabase
    .from("event_pledges")
    .select("id, status, collection_reference_id")
    .eq("id", pledgeId)
    .single();

  if (!pledge || pledge.collection_reference_id !== referenceId) {
    return NextResponse.json({ error: "Pledge not found" }, { status: 404 });
  }

  // Already resolved on a previous poll - don't re-check MTN or overwrite it.
  if (pledge.status === "confirmed" || pledge.status === "cancelled") {
    return NextResponse.json({ status: pledge.status });
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

  if (momoStatus === "SUCCESSFUL") {
    await supabase
      .from("event_pledges")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", pledgeId);
    return NextResponse.json({ status: "confirmed" });
  }

  if (momoStatus === "FAILED") {
    await supabase.from("event_pledges").update({ status: "cancelled" }).eq("id", pledgeId);
    return NextResponse.json({ status: "cancelled" });
  }

  return NextResponse.json({ status: "pending" });
}
