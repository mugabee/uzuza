"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";

type Notification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.rpc("list_notifications", {
        p_unread_only: tab === "unread",
      });
      if (!cancelled) setNotifications(data ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  async function markAllRead() {
    setLoading(true);
    const supabase = createClient();
    await supabase.rpc("mark_all_notifications_read");
    setNotifications((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? prev);
    setLoading(false);
  }

  async function openNotification(n: Notification) {
    if (!n.read_at) {
      const supabase = createClient();
      await supabase.rpc("mark_notification_read", { p_id: n.id });
      setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev);
    }
    if (n.link) router.push(n.link);
  }

  const hasUnread = notifications?.some((n) => !n.read_at);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-primary">
            Notifications
          </h1>
          {hasUnread && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={loading}
              className="text-sm font-medium text-primary/70 transition-colors duration-150 hover:text-primary disabled:opacity-40"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="flex gap-1 rounded-full bg-surface-secondary p-1 text-sm font-medium">
          {(["all", "unread"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-full py-2 capitalize transition-all duration-200 ${
                tab === key
                  ? "bg-surface text-primary shadow-[var(--shadow-soft)]"
                  : "text-foreground/60 hover:text-foreground/80"
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <Card className="p-2">
          {notifications === null ? (
            <p className="p-4 text-center text-sm text-foreground/50">Loading...</p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
                  <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
                </svg>
              </span>
              <p className="text-sm font-medium text-foreground/60">
                {tab === "unread" ? "You're all caught up :)" : "You don't have any notifications yet :)"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3.5 text-left transition-colors duration-150 hover:bg-primary/5"
                  >
                    {!n.read_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    )}
                    <div className={`min-w-0 flex-1 ${n.read_at ? "pl-5" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-semibold ${n.read_at ? "text-foreground/70" : "text-foreground"}`}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-xs text-foreground/40">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-foreground/60">{n.body}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Link href="/" className="text-center text-sm text-foreground/50 hover:text-primary">
          Back to home
        </Link>
      </div>
    </main>
  );
}
