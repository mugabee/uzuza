import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";

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
      "id, name, group_type, contribution_amount, frequency, target_size, created_at",
    )
    .eq("id", id)
    .single();

  if (!group) notFound();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="max-w-sm">
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          {group.group_type === "rotating" ? "Rotating Savings" : "Event Contribution"}
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>
        <dl className="mt-6 flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-foreground/60">Contribution</dt>
            <dd className="font-medium">
              {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
              {group.frequency}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-foreground/60">Target size</dt>
            <dd className="font-medium">{group.target_size} members</dd>
          </div>
        </dl>
        <p className="mt-6 text-xs text-foreground/50">
          Group created. Ledger, contributions, and invites arrive in Phase
          2.
        </p>
      </Card>
    </main>
  );
}
