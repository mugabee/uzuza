import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Card } from "@/components/Card";
import { InviteCard } from "@/components/InviteCard";
import { MemberManagement } from "@/components/MemberManagement";
import { MomoNumberEditor } from "@/components/MomoNumberEditor";
import { AccountTypeEditor } from "@/components/AccountTypeEditor";
import { SafetyFundEditor } from "@/components/SafetyFundEditor";
import { ProposalsPanel } from "@/components/ProposalsPanel";
import { PauseExitControls } from "@/components/PauseExitControls";
import { GroupConstitutionSection } from "@/components/GroupConstitutionSection";

export default async function GroupSettingsPage({
  params,
}: PageProps<"/groups/[id]/settings">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id, name, group_type, contribution_amount, frequency, target_size, momo_number, created_by, status, account_type, safety_fund_type, rotation_method, approval_threshold",
    )
    .eq("id", id)
    .single();

  if (!group) notFound();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", id);

  const currentMembership = members?.find((m) => m.user_id === user.id);
  if (!currentMembership) redirect(`/groups/${id}`);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url")
        .in("id", memberIds)
    : { data: [] };

  const membersWithNames = (members ?? []).map((m) => ({
    ...m,
    profile: profiles?.find((p) => p.id === m.user_id) ?? null,
  }));

  const isAdmin = currentMembership.role === "admin";

  const { data: proposals } = await supabase
    .from("group_change_proposals")
    .select("id, change_type, payload, status, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const { data: acknowledgments } = await supabase
    .from("constitution_acknowledgments")
    .select("user_id, acknowledged_at")
    .eq("group_id", id);

  const hasAcknowledged = (acknowledgments ?? []).some(
    (a) => a.user_id === user.id,
  );

  const membersWithStatus = (members ?? []).map((m) => ({
    userId: m.user_id,
    name: profiles?.find((p) => p.id === m.user_id)?.full_name ?? "Member",
    acknowledgedAt:
      acknowledgments?.find((a) => a.user_id === m.user_id)?.acknowledged_at ?? null,
  }));

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-primary">
            Group settings
          </h1>
          <Link
            href={`/groups/${id}`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Back
          </Link>
        </div>

        {group.status !== "forming" && <InviteCard groupId={id} />}

        <Card>
          <h2 className="font-display text-lg font-semibold text-primary">
            Group info
          </h2>
          <p className="mt-1 text-sm text-foreground/70">
            {group.name}
            {group.group_type === "rotating" && (
              <>
                {" "}
                · {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
                {group.frequency}
              </>
            )}
          </p>
          {isAdmin && (
            <MomoNumberEditor groupId={id} currentNumber={group.momo_number} />
          )}
          {isAdmin && (
            <AccountTypeEditor
              groupId={id}
              currentAccountType={group.account_type}
            />
          )}
        </Card>

        {group.group_type === "rotating" && (
          <GroupConstitutionSection
            groupId={id}
            groupName={group.name}
            contributionAmount={Number(group.contribution_amount)}
            frequency={group.frequency}
            rotationMethod={group.rotation_method}
            approvalThreshold={group.approval_threshold}
            membersWithStatus={membersWithStatus}
            hasAcknowledged={hasAcknowledged}
          />
        )}

        {isAdmin && group.group_type === "rotating" && (
          <SafetyFundEditor groupId={id} currentType={group.safety_fund_type} />
        )}

        <MemberManagement
          groupId={id}
          members={membersWithNames}
          currentUserId={user.id}
          isAdmin={isAdmin}
        />

        {isAdmin && group.group_type === "rotating" && (
          <ProposalsPanel groupId={id} proposals={proposals ?? []} />
        )}

        <div>
          <p className="mb-2 px-1 text-sm font-medium text-foreground">
            Leave this group
          </p>
          <PauseExitControls groupId={id} />
        </div>
      </div>
    </main>
  );
}
