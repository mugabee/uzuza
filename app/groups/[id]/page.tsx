import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupLedger } from "@/components/GroupLedger";
import { FormingGroupView } from "@/components/FormingGroupView";

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
      "id, name, group_type, contribution_amount, frequency, target_size, momo_number, created_by, status, is_matching_group",
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

  if (group.status === "forming") {
    if (!currentMembership) redirect(`/groups/${id}/reserve`);

    const { data: reservations } = await supabase
      .from("reservations")
      .select("id, user_id, fee_amount, status, transaction_id, screenshot_path")
      .eq("group_id", id);

    const reservationsWithNames = (reservations ?? []).map((r) => ({
      ...r,
      profile: profiles?.find((p) => p.id === r.user_id) ?? null,
    }));

    return (
      <main className="flex flex-1 flex-col items-center px-6 py-16">
        <FormingGroupView
          group={group}
          isAdmin={currentMembership.role === "admin"}
          members={membersWithNames}
          reservations={reservationsWithNames}
        />
      </main>
    );
  }

  const { data: latestCycle } = await supabase
    .from("cycles")
    .select("id, cycle_number, status, recipient_user_id, started_at")
    .eq("group_id", id)
    .order("cycle_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeCycle =
    latestCycle?.status === "active" ? latestCycle : null;
  const completedCycle =
    latestCycle?.status === "completed" ? latestCycle : null;

  const { data: contributions } = latestCycle
    ? await supabase
        .from("contributions")
        .select(
          "id, member_id, unique_reference, amount, status, transaction_id, screenshot_path, rejected_reason",
        )
        .eq("cycle_id", latestCycle.id)
    : { data: [] };

  const contributionsWithNames = (contributions ?? []).map((c) => ({
    ...c,
    profile: profiles?.find((p) => p.id === c.member_id) ?? null,
  }));

  const { data: payoutRequest } = completedCycle
    ? await supabase
        .from("payout_requests")
        .select("id, amount, status, recipient_user_id")
        .eq("cycle_id", completedCycle.id)
        .maybeSingle()
    : { data: null };

  const { data: payoutApprovals } = payoutRequest
    ? await supabase
        .from("payout_approvals")
        .select("approved_by")
        .eq("payout_request_id", payoutRequest.id)
    : { data: [] };

  const recipientProfile = completedCycle
    ? (profiles?.find((p) => p.id === completedCycle.recipient_user_id) ?? null)
    : null;

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <GroupLedger
        group={group}
        currentUserId={user.id}
        isMember={!!currentMembership}
        isAdmin={currentMembership?.role === "admin"}
        members={membersWithNames}
        activeCycle={activeCycle}
        contributions={contributionsWithNames}
        completedCycle={completedCycle}
        payoutRequest={payoutRequest ?? null}
        payoutApprovalCount={payoutApprovals?.length ?? 0}
        currentUserHasApprovedPayout={
          !!payoutApprovals?.some((a) => a.approved_by === user.id)
        }
        recipientName={recipientProfile?.full_name ?? "the recipient"}
      />
    </main>
  );
}
