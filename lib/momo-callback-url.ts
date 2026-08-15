import "server-only";

/**
 * Returns undefined (meaning: don't attach X-Callback-Url at all, MoMo
 * calls stay exactly as they were, polling-only) until
 * MOMO_CALLBACK_SECRET is actually set — so wiring this up is a no-op
 * on every existing deployment until someone deliberately turns it on.
 *
 * The secret lives in the URL path itself, not a header, because
 * MTN's callback delivery doesn't sign its requests the way e.g.
 * Standard Webhooks does — there's no HMAC to verify. An unguessable
 * path segment is the realistic protection available for an endpoint
 * like this, and the receiver never trusts anything about the
 * callback's own body/status claim anyway (see lib/momo-reconcile.ts) —
 * it only treats a hit on this URL as "go check the real status now",
 * using Uzuza's own authenticated MTN credentials. That combination
 * means the secret's job is limited to stopping random abuse (someone
 * spamming the endpoint to burn API calls), not authenticating the
 * payload — which is a more honest design than pretending to verify a
 * signature MTN doesn't actually provide.
 */
export function buildMomoCallbackUrl(
  kind: "collections" | "disbursements",
  source: "contribution" | "topup" | "pledge" | "withdrawal",
  referenceId: string,
): string | undefined {
  const secret = process.env.MOMO_CALLBACK_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !siteUrl) return undefined;

  const url = new URL(`${siteUrl}/api/momo/webhook/${kind}/${secret}`);
  url.searchParams.set("source", source);
  url.searchParams.set("ref", referenceId);
  return url.toString();
}
