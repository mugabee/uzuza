import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily scheduled job — the first proactive (not reactive-to-another-user)
 * notification in the app. Finds cycles with an admin-set due_date landing
 * within the next 2 days, and reminds any member whose contribution for
 * that cycle is still pending and hasn't already been reminded
 * (contributions.reminded_at guards against re-notifying every run).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 2);
  const todayStr = today.toISOString().slice(0, 10);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  const { data: cycles, error } = await supabase
    .from("cycles")
    .select("id, group_id, due_date, groups!inner(name)")
    .eq("status", "active")
    .not("due_date", "is", null)
    .gte("due_date", todayStr)
    .lte("due_date", windowEndStr);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};

  for (const cycle of cycles ?? []) {
    const groupName = (cycle.groups as unknown as { name: string })?.name ?? "your group";

    const { data: pending } = await supabase
      .from("contributions")
      .select("id, member_id, amount")
      .eq("cycle_id", cycle.id)
      .eq("status", "pending")
      .is("reminded_at", null);

    for (const contribution of pending ?? []) {
      await supabase.rpc("create_notification", {
        p_user_id: contribution.member_id,
        p_title: "Payment due soon",
        p_body: `Your ${Number(contribution.amount).toLocaleString()} RWF contribution to ${groupName} is due ${cycle.due_date}.`,
        p_link: `/groups/${cycle.group_id}`,
      });
      await supabase
        .from("contributions")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", contribution.id);
      results[contribution.id] = "reminded";
    }
  }

  return Response.json({ processed: Object.keys(results).length, results });
}
