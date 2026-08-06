import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupLedger } from "@/components/GroupLedger";

export default async function GroupPage({
  params,
}: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id, name, group_type, contribution_amount, frequency, target_size, momo_number, created_by",
    )
    .eq("id", id)
    .single();

  if (!group) notFound();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", id);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", memberIds)
    : { data: [] };

  const membersWithNames = (members ?? []).map((m) => ({
    ...m,
    profile: profiles?.find((p) => p.id === m.user_id) ?? null,
  }));

  const currentMembership = membersWithNames.find((m) => m.user_id === user.id);

  const { data: activeCycle } = await supabase
    .from("cycles")
    .select("id, cycle_number, status, recipient_user_id, started_at")
    .eq("group_id", id)
    .eq("status", "active")
    .maybeSingle();

  const { data: contributions } = activeCycle
    ? await supabase
        .from("contributions")
        .select(
          "id, member_id, unique_reference, amount, status, transaction_id, screenshot_path, rejected_reason",
        )
        .eq("cycle_id", activeCycle.id)
    : { data: [] };

  const contributionsWithNames = (contributions ?? []).map((c) => ({
    ...c,
    profile: profiles?.find((p) => p.id === c.member_id) ?? null,
  }));

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <GroupLedger
        group={group}
        currentUserId={user.id}
        isMember={!!currentMembership}
        isAdmin={currentMembership?.role === "admin"}
        members={membersWithNames}
        activeCycle={activeCycle ?? null}
        contributions={contributionsWithNames}
      />
    </main>
  );
}
