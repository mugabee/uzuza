// Standalone technical proof that the MTN MoMo Collections sandbox
// integration works: get a token, issue a real Request to Pay, poll its
// status. Separate from the app's actual payment flow, which stays manual
// (unique reference + admin confirmation) per CLAUDE.md Section 3.2 — this
// just proves the credentials and API calls are wired correctly.
//
// Sandbox quirk: currency must be EUR regardless of the group's real RWF
// amounts. Any payer MSISDN except MTN's documented special test numbers
// (e.g. 46733123450, which deterministically returns FAILED) returns
// SUCCESSFUL.
const SUB_KEY = process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY;
const API_USER = process.env.MOMO_COLLECTIONS_API_USER;
const API_KEY = process.env.MOMO_COLLECTIONS_API_KEY;
const BASE = "https://sandbox.momodeveloper.mtn.com";

async function getToken() {
  const basic = Buffer.from(`${API_USER}:${API_KEY}`).toString("base64");
  const res = await fetch(`${BASE}/collection/token/`, {
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
  console.log("--- Request to Pay ---", ref);
  const requestRes = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
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
      payer: { partyIdType: "MSISDN", partyId: "250788123456" },
      payerMessage: "Uzuza sandbox check",
      payeeNote: "Uzuza sandbox check",
    }),
  });
  console.log(requestRes.status);

  await new Promise((r) => setTimeout(r, 3000));

  console.log("--- Check status ---");
  const statusRes = await fetch(`${BASE}/collection/v1_0/requesttopay/${ref}`, {
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
  console.log("MoMo Collections sandbox integration verified working.");
}

main();
