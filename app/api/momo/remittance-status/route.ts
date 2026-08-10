import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRemittanceTransactionStatus } from "@/lib/momo-remittances";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
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
