export async function sendOtpSms(phone: string, otp: string) {
  const apiKey = process.env.AFRICAS_TALKING_API_KEY!;
  const username = process.env.AFRICAS_TALKING_USERNAME!;

  // Sandbox app (username "sandbox") uses a different host than production.
  const host =
    username === "sandbox"
      ? "api.sandbox.africastalking.com"
      : "api.africastalking.com";

  const res = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      username,
      to: phone,
      message: `Your Uzuza verification code is ${otp}. It expires in a few minutes.`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Africa's Talking SMS send failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
