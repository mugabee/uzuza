import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Unauthenticated liveness/readiness check for external uptime
 * monitoring (UptimeRobot, BetterStack, etc.). Confirms the app can
 * actually reach the database, not just that the process is up.
 */
export async function GET() {
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").select("id").limit(1);

  if (error) {
    return Response.json({ status: "error", database: false }, { status: 503 });
  }

  return Response.json({ status: "ok", database: true });
}
