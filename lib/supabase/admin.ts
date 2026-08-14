import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses Row Level Security entirely.
 * Only for privileged server-side operations (webhooks, internal ops
 * console, scheduled jobs). Never import this into client components
 * or anything reachable from the browser. (No "server-only" import
 * guard here — every caller is already a Route Handler, which Next.js
 * guarantees never reaches a client bundle; the guard itself triggered
 * a duplicate-package webpack resolution conflict against this host's
 * nodevenv global node_modules, confirmed via a real failed build.)
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
