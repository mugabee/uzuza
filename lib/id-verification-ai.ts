import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type IdVerificationMatchResult = "match" | "mismatch" | "low_confidence" | "unavailable";

export type IdVerificationAiResult = {
  extractedName: string | null;
  matchResult: IdVerificationMatchResult;
  matchConfidence: number | null;
  notes: string;
  raw: Record<string, unknown> | null;
};

// Simple normalized-Levenshtein similarity (0-1) — no dependency needed
// for something this small. Names are compared after lowercasing and
// collapsing whitespace so "JEAN  Baptiste" and "jean baptiste" match
// cleanly regardless of how each system capitalizes/spaces things.
function similarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase().replace(/\s+/g, " ");
  const s2 = b.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const m = s1.length;
  const n = s2.length;
  const dp: number[] = Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = s1[i - 1] === s2[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  const distance = dp[n];
  return 1 - distance / Math.max(m, n);
}

const MATCH_THRESHOLD = 0.85;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Extracts the printed full name from a national ID's front/back photos
 * via Claude's vision capability and compares it to the name the user
 * registered with. Advisory only — this never determines the final
 * verification outcome, only feeds a suggestion into the staff review
 * queue (id_verification_requests). Degrades gracefully to
 * 'unavailable' if ANTHROPIC_API_KEY isn't configured, matching the
 * same optional-service pattern already used for RESEND_API_KEY/Sentry
 * elsewhere in this app — a missing key never blocks the actual
 * submission, staff just do the name comparison manually.
 */
export async function extractAndCompareName(
  frontImage: { data: Buffer; mediaType: string },
  backImage: { data: Buffer; mediaType: string },
  registeredName: string | null,
): Promise<IdVerificationAiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      extractedName: null,
      matchResult: "unavailable",
      matchConfidence: null,
      notes: "AI name extraction unavailable — ANTHROPIC_API_KEY is not configured. Staff must compare the ID photos to the registered name manually.",
      raw: null,
    };
  }

  const client = new Anthropic({ apiKey });

  let extractedName: string | null = null;
  let extractionConfidence: "high" | "medium" | "low" | "unreadable" = "unreadable";
  let raw: Record<string, unknown> | null = null;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: frontImage.mediaType as "image/jpeg" | "image/png" | "image/webp", data: frontImage.data.toString("base64") },
            },
            {
              type: "image",
              source: { type: "base64", media_type: backImage.mediaType as "image/jpeg" | "image/png" | "image/webp", data: backImage.data.toString("base64") },
            },
            {
              type: "text",
              text:
                "These two images are the front and back of a government-issued ID document. " +
                "Extract only the full legal name printed on the document. " +
                'Respond with ONLY a JSON object, no other text, in exactly this shape: ' +
                '{"extracted_name": string or null, "confidence": "high"|"medium"|"low"|"unreadable", "notes": string}. ' +
                'Set "extracted_name" to null and confidence to "unreadable" if no name is legible. ' +
                "Do not attempt to identify the person, verify authenticity, or comment on anything beyond the printed name.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const parsed = textBlock ? JSON.parse(textBlock.text) : null;
    raw = parsed;
    extractedName = typeof parsed?.extracted_name === "string" ? parsed.extracted_name : null;
    extractionConfidence = parsed?.confidence ?? "unreadable";
  } catch (err) {
    return {
      extractedName: null,
      matchResult: "unavailable",
      matchConfidence: null,
      notes: `AI name extraction failed: ${err instanceof Error ? err.message : "unknown error"}. Staff must compare manually.`,
      raw: null,
    };
  }

  if (!extractedName || extractionConfidence === "unreadable" || !registeredName) {
    return {
      extractedName,
      matchResult: "unavailable",
      matchConfidence: null,
      notes: !registeredName
        ? "User has no registered name on file to compare against."
        : "The AI could not clearly read a name from the submitted photos.",
      raw,
    };
  }

  const score = similarity(extractedName, registeredName);
  const matchResult: IdVerificationMatchResult =
    score >= MATCH_THRESHOLD ? "match" : score >= LOW_CONFIDENCE_THRESHOLD ? "low_confidence" : "mismatch";

  return {
    extractedName,
    matchResult,
    matchConfidence: Math.round(score * 1000) / 1000,
    notes: `Extraction confidence: ${extractionConfidence}. Name similarity to registered name: ${(score * 100).toFixed(0)}%.`,
    raw,
  };
}
