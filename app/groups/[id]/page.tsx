import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupLedger } from "@/components/GroupLedger";
import { FormingGroupView } from "@/components/FormingGroupView";
import { EventPledgeBoard } from "@/components/EventPledgeBoard";

export default async function GroupPage({
  params,
}: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id, name, group_type, contribution_amount, frequency, target_size, momo_number, created_by, status, is_matching_group, account_type",
    )
    .eq("id", id)
    .single();

  if (!group) notFound();

  // Event groups are meant to be publicly shareable via link/QR (Section
  // 3.3) - an anonymous scanner can view and pledge without an account
  // first. Every other group type still requires being signed in, same as
  // before.
  if (group.group_type !== "event" && !user) redirect("/login");

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

  const currentMembership = membersWithNames.find((m) => m.user_id === user?.id);

  if (group.group_type === "event") {
    const { data: pledges } = await supabase.rpc("get_pledge_board", {
      p_group_id: id,
    });
    const { data: total } = await supabase.rpc("get_pledge_total", {
      p_group_id: id,
    });

    const { data: payoutRequest } = await supabase
      .from("payout_requests")
      .select("id, amount, status, recipient_user_id")
      .eq("event_group_id", id)
      .maybeSingle();

    const { data: payoutApprovals } = payoutRequest
      ? await supabase
          .from("payout_approvals")
          .select("approved_by")
          .eq("payout_request_id", payoutRequest.id)
      : { data: [] };

    const organizerProfile = profiles?.find((p) => p.id === group.created_by);

    return (
      <main className="flex flex-1 flex-col items-center px-6 py-16">
        <EventPledgeBoard
          group={group}
          isAdmin={currentMembership?.role === "admin"}
          pledges={pledges ?? []}
          total={Number(total ?? 0)}
          payoutRequest={payoutRequest ?? null}
          payoutApprovalCount={payoutApprovals?.length ?? 0}
          currentUserHasApprovedPayout={
            !!payoutApprovals?.some((a) => a.approved_by === user?.id)
          }
          organizerName={organizerProfile?.full_name ?? "the organizer"}
          signedIn={!!user}
        />
      </main>
    );
  }

  // Every non-event group already required a signed-in user above; this
  // is redundant at runtime but lets TypeScript narrow `user` for the
  // rest of the function instead of treating it as possibly null.
  if (!user) redirect("/login");

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

    const { data: acknowledgments } = await supabase
      .from("constitution_acknowledgments")
      .select("user_id")
      .eq("group_id", id);
    const acknowledgedUserIds = new Set((acknowledgments ?? []).map((a) => a.user_id));

    return (
      <main className="flex flex-1 flex-col items-center px-6 py-16">
        <FormingGroupView
          group={group}
          isAdmin={currentMembership.role === "admin"}
          members={membersWithNames}
          reservations={reservationsWithNames}
          currentUserId={user.id}
          hasAcknowledgedConstitution={acknowledgedUserIds.has(user.id)}
          acknowledgedCount={acknowledgedUserIds.size}
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
          "id, member_id, unique_reference, amount, status, transaction_id, screenshot_path, rejected_reason, missed_fine_amount, payment_channel, payer_currency, payer_amount",
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
