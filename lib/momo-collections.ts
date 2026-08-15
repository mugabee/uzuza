const BASE = "https://sandbox.momodeveloper.mtn.com";

async function getToken() {
  const subKey = process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY!;
  const apiUser = process.env.MOMO_COLLECTIONS_API_USER!;
  const apiKey = process.env.MOMO_COLLECTIONS_API_KEY!;
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");

  const res = await fetch(`${BASE}/collection/token/`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": subKey,
      Authorization: `Basic ${basic}`,
      "Content-Length": "0",
    },
  });
  if (!res.ok) {
    throw new Error(`Collections token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/**
 * Requests payment directly from a payer's phone via MTN MoMo Collections.
 * MTN sends the actual PIN prompt to that phone through their own app/
 * USSD channel - Uzuza never sees or handles a PIN, only ever gets a
 * pending/successful/failed status back. Sandbox only, same status as
 * every other MoMo integration in this app until legal review clears real
 * fund movement (CLAUDE.md Phase 7 status note).
 */
export async function requestToPay(params: {
  referenceId: string;
  amount: number;
  payerMsisdn: string;
  payerMessage: string;
  payeeNote: string;
  callbackUrl?: string;
}) {
  const subKey = process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY!;
  const token = await getToken();

  const res = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": params.referenceId,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": subKey,
      "Content-Type": "application/json",
      // Asks MTN to push a status update here as soon as the payer
      // resolves the prompt, instead of relying solely on polling.
      // Optional — omitted entirely when no callback URL was built
      // (e.g. MOMO_CALLBACK_SECRET isn't configured yet), in which case
      // this behaves exactly as before.
      ...(params.callbackUrl ? { "X-Callback-Url": params.callbackUrl } : {}),
    },
    body: JSON.stringify({
      amount: String(params.amount),
      currency: "EUR", // sandbox requirement, regardless of the real RWF amount
      externalId: params.referenceId,
      payer: { partyIdType: "MSISDN", partyId: params.payerMsisdn },
      payerMessage: params.payerMessage,
      payeeNote: params.payeeNote,
    }),
  });

  if (res.status !== 202) {
    throw new Error(`Request to Pay failed: ${res.status} ${await res.text()}`);
  }
}

export async function getRequestToPayStatus(referenceId: string) {
  const subKey = process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY!;
  const token = await getToken();

  const res = await fetch(`${BASE}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": subKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Request to Pay status check failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ status: "PENDING" | "SUCCESSFUL" | "FAILED"; [k: string]: unknown }>;
}
