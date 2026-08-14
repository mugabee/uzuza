import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../../../lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";

export default async function CycleSummaryPage({
  params,
}: PageProps<"/groups/[id]/cycles/[cycleId]/summary">) {
  const { id, cycleId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!group) notFound();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", id);

  const isMember = (members ?? []).some((m) => m.user_id === user.id);
  if (!isMember) redirect(`/groups/${id}`);

  const { data: cycle } = await supabase
    .from("cycles")
    .select("id, cycle_number, status, recipient_user_id, started_at, completed_at")
    .eq("id", cycleId)
    .eq("group_id", id)
    .single();

  if (!cycle) notFound();

  const { data: contributions } = await supabase
    .from("contributions")
    .select("member_id, amount, status, transaction_id")
    .eq("cycle_id", cycleId);

  const memberIds = (contributions ?? []).map((c) => c.member_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] };

  const { data: payoutRequest } = await supabase
    .from("payout_requests")
    .select("amount, status, transaction_id, completed_at")
    .eq("cycle_id", cycleId)
    .maybeSingle();

  const recipientName =
    profiles?.find((p) => p.id === cycle.recipient_user_id)?.full_name ??
    "the recipient";
  const total = (contributions ?? []).reduce((sum, c) => sum + Number(c.amount), 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col px-6 py-16 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/groups/${id}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          ← Back to group
        </Link>
        <PrintButton />
      </div>

      <h1 className="mt-6 font-display text-2xl font-semibold text-primary print:mt-0">
        {group.name} — Cycle {cycle.cycle_number} Summary
      </h1>
      <p className="mt-1 text-sm text-foreground/60">
        Started {new Date(cycle.started_at).toLocaleDateString()}
        {cycle.completed_at &&
          ` — completed ${new Date(cycle.completed_at).toLocaleDateString()}`}
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-foreground/60">
            <th className="py-2">Member</th>
            <th className="py-2">Amount</th>
            <th className="py-2">Status</th>
            <th className="py-2">Transaction ID</th>
          </tr>
        </thead>
        <tbody>
          {(contributions ?? []).map((c, i) => (
            <tr key={i} className="border-b border-black/5">
              <td className="py-2">
                {profiles?.find((p) => p.id === c.member_id)?.full_name ??
                  "Member"}
              </td>
              <td className="py-2">{Number(c.amount).toLocaleString()} RWF</td>
              <td className="py-2 capitalize">{c.status}</td>
              <td className="py-2 font-mono text-xs">{c.transaction_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-sm font-semibold">
        Total collected: {total.toLocaleString()} RWF
      </p>

      <div className="mt-6 rounded-lg bg-primary/5 p-4 text-sm">
        <p className="font-semibold text-foreground">
          Payout to {recipientName}
        </p>
        {payoutRequest ? (
          <>
            <p className="mt-1">
              {Number(payoutRequest.amount).toLocaleString()} RWF —{" "}
              <span className="capitalize">{payoutRequest.status}</span>
            </p>
            {payoutRequest.transaction_id && (
              <p className="mt-1 font-mono text-xs">
                Transaction: {payoutRequest.transaction_id}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-foreground/60">Not yet requested.</p>
        )}
      </div>
    </main>
  );
}
