"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { friendlyError } from "@/lib/friendly-error";

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

  // Lightweight polling refresh instead of a realtime subscription — keeps
  // this consistent with the rest of the app's router.refresh() pattern.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [router]);

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
    <Card>
      <h1 className="font-display text-lg font-semibold text-primary">
        {groupName} — Chat
      </h1>
      <p className="mt-1 text-xs text-foreground/50">
        Text only, no links or media. Visible to current group members.
      </p>

      <div className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto">
        {initialMessages.length === 0 && (
          <p className="text-sm text-foreground/50">No messages yet.</p>
        )}
        {initialMessages.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-foreground">
                {m.sender_id === currentUserId ? "You" : m.senderName}
              </span>
              <button
                type="button"
                onClick={() => handleFlag(m.id)}
                className="text-xs text-foreground/30 hover:text-red-500"
              >
                Report
              </button>
            </div>
            <p className="text-foreground/80">{m.body}</p>
          </div>
        ))}
      </div>

      {canSend ? (
        <form onSubmit={handleSend} className="mt-4 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say something..."
            maxLength={500}
            className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" disabled={busy}>
            Send
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-xs text-foreground/50">
          You can't send messages in this chat right now.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </Card>
  );
}
