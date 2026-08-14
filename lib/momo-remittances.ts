const BASE = "https://sandbox.momodeveloper.mtn.com";

async function getToken() {
  const subKey = process.env.MOMO_REMITTANCES_SUBSCRIPTION_KEY!;
  const apiUser = process.env.MOMO_REMITTANCES_API_USER!;
  const apiKey = process.env.MOMO_REMITTANCES_API_KEY!;
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");

  const res = await fetch(`${BASE}/remittance/token/`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": subKey,
      Authorization: `Basic ${basic}`,
      "Content-Length": "0",
    },
  });
  if (!res.ok) {
    throw new Error(`Remittances token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/**
 * Looks up the status of an MTN MoMo remittance transaction by reference,
 * so staff confirming a payment tagged `momo_remittance` can check it
 * against MTN's own record rather than relying on the screenshot alone.
 * Sandbox only, same status as lib/momo-disbursements.ts - real senders
 * abroad initiate the transfer through their own bank/remittance partner,
 * Uzuza only ever reads status here, never pushes/pulls funds itself.
 */
export async function getRemittanceTransactionStatus(referenceId: string) {
  const subKey = process.env.MOMO_REMITTANCES_SUBSCRIPTION_KEY!;
  const token = await getToken();

  const res = await fetch(`${BASE}/remittance/v1_0/transfer/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": subKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Remittance status check failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
