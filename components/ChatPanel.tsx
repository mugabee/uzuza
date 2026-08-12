"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { usePoll } from "@/lib/use-poll";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  flagged: boolean;
  created_at: string;
  senderName: string;
};

export function ChatPanel({
  groupId,
  groupName,
  canSend,
  currentUserId,
  initialMessages,
}: {
  groupId: string;
  groupName: string;
  canSend: boolean;
  currentUserId: string;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Lightweight polling refresh instead of a realtime subscription — keeps
  // this consistent with the rest of the app's router.refresh() pattern.
  usePoll(() => router.refresh(), 8000);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [initialMessages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("send_chat_message", {
      p_group_id: groupId,
      p_body: body,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    setBody("");
    router.refresh();
  }

  async function handleFlag(messageId: string) {
    const supabase = createClient();
    await supabase.rpc("flag_chat_message", { p_message_id: messageId });
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="font-display text-lg font-semibold text-primary">
          {groupName} — Chat
        </h1>
        <p className="mt-0.5 text-xs text-foreground/50">
          Text only, no links or media. Visible to current group members.
        </p>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3"
        style={{
          backgroundColor: "var(--chat-wallpaper)",
          backgroundImage:
            "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {initialMessages.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/40">
            No messages yet — say hello.
          </p>
        )}
        {initialMessages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`relative max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                  mine
                    ? "rounded-tr-none bg-chat-bubble-mine text-foreground"
                    : "rounded-tl-none bg-surface text-foreground"
                }`}
              >
                {!mine && (
                  <p className="text-xs font-semibold text-primary">{m.senderName}</p>
                )}
                <div className="flex items-end justify-between gap-2">
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <button
                    type="button"
                    onClick={() => handleFlag(m.id)}
                    aria-label="Report message"
                    className="shrink-0 text-[10px] text-foreground/25 hover:text-danger"
                  >
                    ⚑
                  </button>
                </div>
                <span className="mt-0.5 block text-right text-[10px] text-foreground/40">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-border p-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message"
            maxLength={500}
            className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[var(--shadow-soft)] transition-transform duration-150 active:scale-95 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
            </svg>
          </button>
        </form>
      ) : (
        <p className="shrink-0 border-t border-border p-3 text-xs text-foreground/50">
          You can't send messages in this chat right now.
        </p>
      )}
      {error && (
        <p role="alert" className="shrink-0 px-3 pb-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
