import { createAdminClient } from "../../../../lib/supabase/admin";
import { sendEmail, notificationDigestHtml } from "../../../../lib/email";

/**
 * Daily scheduled job — same once-a-day Vercel Hobby cron cap as
 * sweep-out and payment-reminders. Batches every not-yet-emailed
 * notification per user into one digest, rather than firing an email per
 * event, since there's no request-scoped Node context available from the
 * plain SQL `create_notification` insert to send synchronously. No-ops
 * safely (via lib/email.ts) until RESEND_API_KEY is actually set.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, link")
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return Response.json({ processed: 0, sent: 0 });
  }

  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const list = byUser.get(n.user_id) ?? [];
    list.push(n);
    byUser.set(n.user_id, list);
  }

  let sentCount = 0;
  const skippedIds: string[] = [];

  for (const [userId, items] of byUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("id", userId)
      .single();

    const ids = items.map((n) => n.id);

    if (profile && profile.email_notifications_enabled === false) {
      skippedIds.push(...ids);
      continue;
    }

    const { data: userResult } = await supabase.auth.admin.getUserById(userId);
    const email = userResult?.user?.email;
    if (!email) {
      skippedIds.push(...ids);
      continue;
    }

    const result = await sendEmail({
      to: email,
      subject: items.length === 1 ? items[0].title : `${items.length} updates from Uzuza`,
      html: notificationDigestHtml(items),
    });

    if (result.sent) {
      sentCount += 1;
      await supabase
        .from("notifications")
        .update({ emailed_at: new Date().toISOString() })
        .in("id", ids);
    }
  }

  if (skippedIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .in("id", skippedIds);
  }

  return Response.json({ processed: pending.length, sent: sentCount, skipped: skippedIds.length });
}
