// Standalone technical proof that the MTN MoMo Remittances sandbox
// integration works — same pattern as momo-collections-check.mjs and
// momo-disbursements-check.mjs. This is the product the "MTN Remittance"
// payment channel (international payments feature) reads transaction
// status from during admin confirmation.
const SUB_KEY = process.env.MOMO_REMITTANCES_SUBSCRIPTION_KEY;
const API_USER = process.env.MOMO_REMITTANCES_API_USER;
const API_KEY = process.env.MOMO_REMITTANCES_API_KEY;
const BASE = "https://sandbox.momodeveloper.mtn.com";

async function getToken() {
  const basic = Buffer.from(`${API_USER}:${API_KEY}`).toString("base64");
  const res = await fetch(`${BASE}/remittance/token/`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": SUB_KEY,
      Authorization: `Basic ${basic}`,
      "Content-Length": "0",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function main() {
  console.log("--- Get access token ---");
  const token = await getToken();
  console.log("token length:", token.length);

  const ref = crypto.randomUUID();
  console.log("--- Transfer ---", ref);
  const transferRes = await fetch(`${BASE}/remittance/v1_0/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": ref,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": SUB_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: "50",
      currency: "EUR",
      externalId: `check-${Date.now()}`,
      payee: { partyIdType: "MSISDN", partyId: "250788123456" },
      payerMessage: "Uzuza remittance sandbox check",
      payeeNote: "Uzuza remittance sandbox check",
    }),
  });
  console.log(transferRes.status);
  if (transferRes.status !== 202) {
    console.log(await transferRes.text());
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 3000));

  console.log("--- Check status ---");
  const statusRes = await fetch(`${BASE}/remittance/v1_0/transfer/${ref}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": SUB_KEY,
    },
  });
  const statusData = await statusRes.json();
  console.log(statusRes.status, statusData);

  if (statusData.status !== "SUCCESSFUL") {
    throw new Error(`Expected SUCCESSFUL, got ${statusData.status}`);
  }
  console.log("MoMo Remittances sandbox integration verified working.");
}

main();
