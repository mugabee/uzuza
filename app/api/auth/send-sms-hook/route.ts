import { Webhook } from "standardwebhooks";
import { sendOtpSms } from "@/lib/africas-talking";

interface SendSmsHookPayload {
  user: { phone: string };
  sms: { otp: string };
}

export async function POST(req: Request) {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  const secret = process.env.SEND_SMS_HOOK_SECRET!.replace("v1,whsec_", "");
  const webhook = new Webhook(secret);

  let verified: SendSmsHookPayload;
  try {
    verified = webhook.verify(payload, headers) as SendSmsHookPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  await sendOtpSms(verified.user.phone, verified.sms.otp);

  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
