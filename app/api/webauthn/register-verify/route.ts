import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { createClient } from "../../../../lib/supabase/server";
import { rpIdFromRequest, WEBAUTHN_CHALLENGE_COOKIE } from "../../../../lib/webauthn";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const expectedChallenge = request.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Registration expired — try again" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.slice(0, 60) : null;
  const { rpID, origin } = rpIdFromRequest(request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body?.credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not verify passkey" },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Passkey verification failed" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;

  const { error: insertError } = await supabase.from("webauthn_credentials").insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_label: deviceLabel,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const response = NextResponse.json({ verified: true });
  response.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE);
  return response;
}
