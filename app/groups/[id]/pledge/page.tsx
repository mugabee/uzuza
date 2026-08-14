import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../../lib/supabase/server";
import { PledgeCard } from "@/components/PledgeCard";
import { DirectMomoPledgeForm } from "@/components/DirectMomoPledgeForm";
import { Card } from "@/components/Card";

export default async function PledgePage({
  params,
}: PageProps<"/groups/[id]/pledge">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, group_type, contribution_amount")
    .eq("id", id)
    .single();

  if (!group || group.group_type !== "event") notFound();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Card>
          <h1 className="font-display text-xl font-semibold text-primary">
            Pledge to {group.name}
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Pay directly with MTN Mobile Money — no account needed. You'll get a
            payment prompt on your own phone to approve.
          </p>
          <div className="mt-4">
            <DirectMomoPledgeForm
              groupId={id}
              suggestedAmount={Number(group.contribution_amount)}
            />
          </div>
        </Card>

        {user ? (
          <details className="rounded-2xl border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground/70">
              Prefer to pay a different way?
            </summary>
            <div className="mt-4">
              <PledgeCard group={group} />
            </div>
          </details>
        ) : (
          <Link
            href={`/login?redirect=${encodeURIComponent(`/groups/${id}/pledge`)}`}
            className="text-center text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Prefer bank transfer, Wise, or already paid another way? Sign in →
          </Link>
        )}
      </div>
    </main>
  );
}
