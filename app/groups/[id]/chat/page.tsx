import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/ChatPanel";

export default async function ChatPage({
  params,
}: PageProps<"/groups/[id]/chat">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, status")
    .eq("id", id)
    .single();

  if (!group) notFound();

  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id, membership_status")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect(`/groups/${id}`);
  const canSend = membership.membership_status === "active" ||
    membership.membership_status === "paused";

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, sender_id, body, flagged, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: true });

  const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))];
  const { data: profiles } = senderIds.length
    ? await supabase.from("profiles").select("id, full_name, phone").in("id", senderIds)
    : { data: [] };

  const messagesWithNames = (messages ?? []).map((m) => {
    const sender = profiles?.find((p) => p.id === m.sender_id);
    return {
      ...m,
      // A member who joined via a deep link (invite/pledge) could
      // previously skip profile setup entirely and never set a name —
      // fall back to their phone's last 4 digits rather than a bare,
      // indistinguishable "Member" for every such sender.
      senderName: sender?.full_name || (sender?.phone ? `Member •${sender.phone.slice(-4)}` : "Member"),
    };
  });

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-4">
      <div className="flex h-[calc(100dvh-6.5rem)] w-full max-w-md flex-col gap-2">
        <Link
          href={`/groups/${id}`}
          className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          ← Back to group
        </Link>
        <ChatPanel
          groupId={id}
          groupName={group.name}
          canSend={canSend}
          currentUserId={user.id}
          initialMessages={messagesWithNames}
        />
      </div>
    </main>
  );
}
