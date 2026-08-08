// Every RPC in this app already raises its own human-readable exception
// text ("Only a group admin can...", "Platform custody cap reached...") —
// those pass through unchanged. This only intercepts the raw, auto
// generated errors Postgres/Supabase produce that were never meant for an
// end user to read: constraint names, RLS policy text, network failures.
const PATTERNS: Array<[RegExp, string]> = [
  [/duplicate key value violates unique constraint.*reservations_active/i, "You've already reserved a spot in this group."],
  [/duplicate key value violates unique constraint.*group_members/i, "You're already a member of this group."],
  [/duplicate key value violates unique constraint/i, "That already exists — try refreshing the page."],
  [/violates row-level security policy/i, "You don't have permission to do that."],
  [/violates foreign key constraint/i, "That record no longer exists — try refreshing the page."],
  [/JWT expired|invalid claim|invalid jwt/i, "Your session expired — please sign in again."],
  [/failed to fetch|networkerror|load failed/i, "Couldn't reach the server — check your connection and try again."],
  [/rate limit|too many requests/i, "You're doing that a bit fast — wait a moment and try again."],
];

export function friendlyError(message: string | null | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  for (const [pattern, friendly] of PATTERNS) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}
