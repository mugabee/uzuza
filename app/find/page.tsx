import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";

type FindGroupResult = {
  id: string;
  name: string;
  group_type: "rotating" | "event";
  contribution_amount: number;
  frequency: string;
  target_size: number;
};

export default async function FindGroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: groups, error } = await supabase.rpc("find_groups") as {
    data: FindGroupResult[] | null;
    error: { message: string } | null;
  };

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Find a group
        </h1>

        {error && <p className="text-sm text-red-500">{error.message}</p>}

        {groups && groups.length === 0 && (
          <p className="text-sm text-foreground/60">
            No groups are open for matching right now.
          </p>
        )}

        {(groups ?? []).map((group) => (
          <Link key={group.id} href={`/groups/${group.id}/reserve`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">{group.name}</h2>
                <span className="text-xs uppercase tracking-wide text-accent">
                  {group.group_type === "rotating" ? "Rotating" : "Event"}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground/70">
                {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
                {group.frequency}, target {group.target_size} members
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
