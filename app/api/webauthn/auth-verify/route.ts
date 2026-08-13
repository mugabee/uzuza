import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { rpIdFromRequest, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn";

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
    return NextResponse.json({ error: "Unlock challenge expired — try again" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const credentialId = body?.credential?.id as string | undefined;
  if (!credentialId) {
    return NextResponse.json({ error: "Malformed passkey response" }, { status: 400 });
  }

  const { data: stored } = await supabase
    .from("webauthn_credentials")
    .select("id, credential_id, public_key, counter, transports")
    .eq("user_id", user.id)
    .eq("credential_id", credentialId)
    .single();

  if (!stored) {
    return NextResponse.json({ error: "Passkey not recognized" }, { status: 400 });
  }

  const { rpID, origin } = rpIdFromRequest(request);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credential_id,
        publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")),
        counter: Number(stored.counter),
        transports: (stored.transports ?? undefined) as AuthenticatorTransport[] | undefined,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not verify passkey" },
      { status: 400 },
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Passkey verification failed" }, { status: 400 });
  }

  await supabase
    .from("webauthn_credentials")
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", stored.id);

  const response = NextResponse.json({ verified: true });
  response.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE);
  return response;
}
