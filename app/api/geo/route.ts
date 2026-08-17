import { NextResponse, type NextRequest } from "next/server";

/**
 * Suggests a country for the phone-number/currency pickers based on the
 * request's approximate IP location. Uses Vercel's own edge-populated
 * `x-vercel-ip-country` header — no third-party geolocation API call, no
 * IP address ever leaves this request, nothing logged or stored. Not
 * available outside Vercel (local dev, or the cPanel host this project
 * may migrate to later per CLAUDE.md) — callers must treat a null
 * country as "no suggestion available" and fall back to a sensible
 * default, never treat this as authoritative.
 */
export async function GET(request: NextRequest) {
  const country = request.headers.get("x-vercel-ip-country");
  return NextResponse.json({ country: country || null });
}
