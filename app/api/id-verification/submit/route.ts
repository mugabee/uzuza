import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { extractAndCompareName } from "../../../../lib/id-verification-ai";

/**
 * Runs after the client has already uploaded the front/back ID photos
 * directly to the private id-verification-photos bucket (same
 * upload-then-call-a-route split used by every proof-of-payment flow in
 * this app). This route does the two things that can't happen in
 * Postgres: downloading the images back out and calling the external
 * Claude vision API to extract a name — then hands the result to
 * submit_id_verification, which owns the actual database write.
 *
 * The AI result is informational only. It is stored on the request row
 * for staff to see, but nothing here approves or rejects anything —
 * that only ever happens via decide_id_verification, called by a staff
 * member in /internal/id-review.
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
  const frontPath = body?.frontPath as string | undefined;
  const backPath = body?.backPath as string | undefined;
  if (!frontPath || !backPath) {
    return NextResponse.json({ error: "Both front and back photos are required" }, { status: 400 });
  }
  // Both paths must live in this user's own folder — belt-and-suspenders
  // alongside the storage RLS policy that already enforces this on
  // upload; catches a mismatched/tampered path before spending an AI
  // call on it.
  if (!frontPath.startsWith(`${user.id}/`) || !backPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid photo path" }, { status: 400 });
  }

  const [frontDownload, backDownload] = await Promise.all([
    supabase.storage.from("id-verification-photos").download(frontPath),
    supabase.storage.from("id-verification-photos").download(backPath),
  ]);
  if (frontDownload.error || !frontDownload.data || backDownload.error || !backDownload.data) {
    return NextResponse.json({ error: "Could not read the uploaded photos" }, { status: 500 });
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

  const frontBuffer = Buffer.from(await frontDownload.data.arrayBuffer());
  const backBuffer = Buffer.from(await backDownload.data.arrayBuffer());

  const aiResult = await extractAndCompareName(
    { data: frontBuffer, mediaType: frontDownload.data.type || "image/jpeg" },
    { data: backBuffer, mediaType: backDownload.data.type || "image/jpeg" },
    profile?.full_name ?? null,
  );

  const { data: requestId, error: submitError } = await supabase.rpc("submit_id_verification", {
    p_front_path: frontPath,
    p_back_path: backPath,
    p_extracted_name: aiResult.extractedName,
    p_match_result: aiResult.matchResult,
    p_match_confidence: aiResult.matchConfidence,
    p_ai_notes: aiResult.notes,
    p_ai_raw_response: aiResult.raw,
  });

  if (submitError) {
    return NextResponse.json({ error: submitError.message }, { status: 500 });
  }

  return NextResponse.json({
    requestId,
    matchResult: aiResult.matchResult,
    matchConfidence: aiResult.matchConfidence,
    extractedName: aiResult.extractedName,
    notes: aiResult.notes,
  });
}
