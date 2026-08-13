import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { rpIdFromRequest, RP_NAME, WEBAUTHN_CHALLENGE_COOKIE } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();

  const { data: existing } = await supabase
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  const { rpID } = rpIdFromRequest(request);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: profile?.phone ?? user.email ?? user.id,
    userDisplayName: profile?.full_name ?? profile?.phone ?? "Uzuza user",
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as AuthenticatorTransport[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: "discouraged",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
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
