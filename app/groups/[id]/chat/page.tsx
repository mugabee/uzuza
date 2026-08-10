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
    ? await supabase.from("profiles").select("id, full_name").in("id", senderIds)
    : { data: [] };

  const messagesWithNames = (messages ?? []).map((m) => ({
    ...m,
    senderName: profiles?.find((p) => p.id === m.sender_id)?.full_name ?? "Member",
  }));

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Link
          href={`/groups/${id}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
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
