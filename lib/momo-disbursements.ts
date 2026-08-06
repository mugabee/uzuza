import "server-only";

const BASE = "https://sandbox.momodeveloper.mtn.com";

async function getToken() {
  const subKey = process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!;
  const apiUser = process.env.MOMO_DISBURSEMENTS_API_USER!;
  const apiKey = process.env.MOMO_DISBURSEMENTS_API_KEY!;
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");

  const res = await fetch(`${BASE}/disbursement/token/`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": subKey,
      Authorization: `Basic ${basic}`,
      "Content-Length": "0",
    },
  });
  if (!res.ok) {
    throw new Error(`Disbursements token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/**
 * Transfers funds from Uzuza's custody to a recipient's MoMo wallet.
 * Sandbox only — MOMO_TARGET_ENVIRONMENT is hardcoded to "sandbox" for
 * this call regardless of env config; there is no production code path
 * here until after legal review (see CLAUDE.md Phase 7 status note).
 */
export async function disburse(params: {
  referenceId: string;
  amount: number;
  recipientMsisdn: string;
  payerMessage: string;
  payeeNote: string;
}) {
  const subKey = process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!;
  const token = await getToken();

  const res = await fetch(`${BASE}/disbursement/v1_0/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": params.referenceId,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": subKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(params.amount),
      currency: "EUR", // sandbox requirement, regardless of the real RWF amount
      externalId: params.referenceId,
      payee: { partyIdType: "MSISDN", partyId: params.recipientMsisdn },
      payerMessage: params.payerMessage,
      payeeNote: params.payeeNote,
    }),
  });

  if (res.status !== 202) {
    throw new Error(`Disbursement request failed: ${res.status} ${await res.text()}`);
  }

  return getTransferStatus(params.referenceId);
}

export async function getTransferStatus(referenceId: string) {
  const subKey = process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!;
  const token = await getToken();

  const res = await fetch(`${BASE}/disbursement/v1_0/transfer/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": subKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Disbursement status check failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
