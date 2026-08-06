import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AcknowledgeButton } from "@/components/AcknowledgeButton";
import { Card } from "@/components/Card";

const APPROVAL_THRESHOLD_LABELS: Record<string, string> = {
  "1": "any one admin",
  "2-of-3": "at least two admins",
  all: "every admin",
};

export default async function ConstitutionPage({
  params,
}: PageProps<"/groups/[id]/constitution">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id, name, group_type, contribution_amount, frequency, target_size, rotation_method, approval_threshold",
    )
    .eq("id", id)
    .single();

  if (!group) notFound();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", id);

  const isMember = (members ?? []).some((m) => m.user_id === user.id);
  if (!isMember) redirect(`/groups/${id}`);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] };

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
      <Card className="max-w-lg">
        <Link
          href={`/groups/${id}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          ← Back to group
        </Link>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name} — Group Constitution
        </h1>

        <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed text-foreground/80">
          <p>
            This is a plain-language summary of how <strong>{group.name}</strong>{" "}
            operates, generated from the group's current settings.
          </p>

          <div>
            <h2 className="font-semibold text-foreground">Contributions</h2>
            <p>
              Each member contributes{" "}
              {Number(group.contribution_amount).toLocaleString()} RWF every{" "}
              {group.frequency === "monthly" ? "month" : "week"}, up to a
              target of {group.target_size} members.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-foreground">Payout order</h2>
            <p>
              The order in which members receive the pooled contribution
              each cycle is decided by{" "}
              {group.rotation_method === "random"
                ? "random draw at the start of each cycle"
                : "a fixed order agreed by the group"}
              .
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-foreground">
              Payment confirmation
            </h2>
            <p>
              A contribution is only marked Paid once an admin verifies the
              MoMo transaction ID and a screenshot of the payment — a
              reference number alone is not sufficient.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-foreground">Payout approval</h2>
            <p>
              Sending the pooled contribution to that cycle's recipient
              requires approval from{" "}
              {APPROVAL_THRESHOLD_LABELS[group.approval_threshold] ??
                group.approval_threshold}
              , plus proof of transfer (transaction ID and screenshot)
              before it can be marked Completed. No single admin can send
              funds alone.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-foreground">
              Not yet in place
            </h2>
            <p className="text-foreground/60">
              Fine structure for missed payments, exit/pause policies, and
              safety-fund coverage are not built into the platform yet and
              will be added in a future update. Until then, these are
              handled by agreement outside the app.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-black/10 pt-6">
          <h2 className="font-semibold text-foreground">Acknowledgment</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {membersWithStatus.map((m) => (
              <li key={m.userId} className="flex items-center justify-between">
                <span>{m.name}</span>
                <span
                  className={
                    m.acknowledgedAt
                      ? "text-xs font-medium text-primary"
                      : "text-xs text-foreground/40"
                  }
                >
                  {m.acknowledgedAt ? "Acknowledged" : "Not yet"}
                </span>
              </li>
            ))}
          </ul>
          {!hasAcknowledged && <AcknowledgeButton groupId={id} />}
        </div>
      </Card>
    </main>
  );
}
