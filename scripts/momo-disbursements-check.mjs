// Standalone technical proof that the MTN MoMo Disbursements sandbox
// integration works — same pattern as scripts/momo-collections-check.mjs.
// This is the API the automated sweep-out cron route depends on.
const SUB_KEY = process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY;
const API_USER = process.env.MOMO_DISBURSEMENTS_API_USER;
const API_KEY = process.env.MOMO_DISBURSEMENTS_API_KEY;
const BASE = "https://sandbox.momodeveloper.mtn.com";

async function getToken() {
  const basic = Buffer.from(`${API_USER}:${API_KEY}`).toString("base64");
  const res = await fetch(`${BASE}/disbursement/token/`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": SUB_KEY,
      Authorization: `Basic ${basic}`,
      "Content-Length": "0",
    },
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  console.log("--- Get access token ---");
  const token = await getToken();
  console.log("token length:", token.length);

  const ref = crypto.randomUUID();
  console.log("--- Transfer ---", ref);
  const transferRes = await fetch(`${BASE}/disbursement/v1_0/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": ref,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": SUB_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: "25000",
      currency: "EUR",
      externalId: `check-${Date.now()}`,
      payee: { partyIdType: "MSISDN", partyId: "250788123456" },
      payerMessage: "Uzuza sweep-out sandbox check",
      payeeNote: "Uzuza sweep-out sandbox check",
    }),
  });
  console.log(transferRes.status);
  if (transferRes.status !== 202) {
    console.log(await transferRes.text());
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 3000));

  console.log("--- Check status ---");
  const statusRes = await fetch(`${BASE}/disbursement/v1_0/transfer/${ref}`, {
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
  console.log("MoMo Disbursements sandbox integration verified working.");
}

main();
