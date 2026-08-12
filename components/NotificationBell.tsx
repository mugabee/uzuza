"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function NotificationBell({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { data } = await supabase.rpc("get_unread_notification_count");
      if (!cancelled) setCount(data ?? 0);
    }

    refresh();
    const interval = setInterval(refresh, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [signedIn, pathname]);

  if (!signedIn || pathname.startsWith("/internal") || pathname.startsWith("/login")) {
    return null;
  }

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className="fixed right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground/70 shadow-[var(--shadow-soft-md)] ring-1 ring-border transition-colors duration-150 hover:text-primary"
      style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
        <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
