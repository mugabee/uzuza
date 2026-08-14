/**
 * rpID must be the exact hostname (no port, no protocol) and must match
 * whatever origin the browser is actually on — derived from the request
 * itself rather than a fixed env var so it keeps working across
 * localhost dev, Vercel preview URLs, and the eventual custom domain.
 */
export function rpIdFromRequest(req: Request): { rpID: string; origin: string } {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const rpID = host.split(":")[0];
  return { rpID, origin: `${proto}://${host}` };
}

export const RP_NAME = "Uzuza";
export const WEBAUTHN_CHALLENGE_COOKIE = "uzuza_webauthn_challenge";
