import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getRemittanceTransactionStatus } from "../../../../lib/momo-remittances";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // A remittance transaction's status is cross-border/staff-facing
  // information, not something any signed-in member should be able to
  // query for an arbitrary reference ID — `requireStaff()` isn't used
  // here since it's built for page Server Components (it `redirect()`s),
  // which isn't the right response shape for an API route.
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  const { referenceId } = await request.json().catch(() => ({}));
  if (!referenceId || typeof referenceId !== "string") {
    return NextResponse.json({ error: "referenceId is required" }, { status: 400 });
  }

  try {
    const status = await getRemittanceTransactionStatus(referenceId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
