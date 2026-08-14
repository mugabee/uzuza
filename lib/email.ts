import { Resend } from "resend";

/**
 * No-ops (with a console warning) when RESEND_API_KEY isn't set, so the
 * digest cron and anything else calling this stays safe to deploy before
 * the key exists — matches the same "sandbox-only, honest about it"
 * discipline as the MoMo integrations.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", to);
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "Uzuza <notifications@uzuza.app>";

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    return { sent: false, error: error.message };
  }
  return { sent: true };
}

export function notificationDigestHtml(items: { title: string; body: string; link: string | null }[]) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://uzuza-v7cu.vercel.app";
  const rows = items
    .map(
      (n) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e0d5;">
          <p style="margin:0;font-weight:600;color:#1a5f4a;font-size:14px;">${escapeHtml(n.title)}</p>
          <p style="margin:4px 0 0;color:#44403c;font-size:13px;">${escapeHtml(n.body)}</p>
        </td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f7f4ee;">
      <h1 style="color:#1a5f4a;font-size:18px;margin:0 0 4px;">Uzuza</h1>
      <p style="color:#57534e;font-size:13px;margin:0 0 20px;">Here's what happened while you were away:</p>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border-radius:12px;padding:0 16px;">
        ${rows}
      </table>
      <p style="margin-top:20px;">
        <a href="${siteUrl}/notifications" style="display:inline-block;background:#1a5f4a;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:13px;font-weight:600;">
          Open Uzuza
        </a>
      </p>
      <p style="margin-top:24px;color:#a8a29e;font-size:11px;">
        You can turn email notifications off anytime in Settings.
      </p>
    </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
