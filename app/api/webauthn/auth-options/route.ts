import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
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

  const { data: creds } = await supabase
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  if (!creds || creds.length === 0) {
    return NextResponse.json({ error: "No passkey enrolled" }, { status: 404 });
  }

  const { rpID } = rpIdFromRequest(request);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: creds.map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as AuthenticatorTransport[] | undefined,
    })),
  });

  const response = NextResponse.json(options);
  response.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return response;
}
