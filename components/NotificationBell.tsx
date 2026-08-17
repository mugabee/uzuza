"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { usePoll } from "../lib/use-poll";

export function NotificationBell({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function refresh() {
    if (!signedIn) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("get_unread_notification_count");
    if (!cancelledRef.current) setCount(data ?? 0);
  }

  // Refetch immediately on navigation (e.g. right after marking things
  // read on /notifications and clicking away), not just on the interval.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, pathname]);

  usePoll(refresh, 20000);

  if (!signedIn || pathname.startsWith("/internal") || pathname.startsWith("/login")) {
    return null;
  }

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className="fixed right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-foreground/70 shadow-[var(--shadow-soft-md)] ring-1 ring-border transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
        <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
