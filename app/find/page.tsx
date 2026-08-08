import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { friendlyError } from "@/lib/friendly-error";

type FindGroupResult = {
  id: string;
  name: string;
  group_type: "rotating" | "event";
  contribution_amount: number;
  frequency: string;
  target_size: number;
  member_count: number;
  admin_name: string | null;
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
        <p className="text-sm text-foreground/60">
          Groups closest to filling are shown first.
        </p>

        {error && <p role="alert" className="text-sm text-red-500">{friendlyError(error.message)}</p>}

        {groups && groups.length === 0 && (
          <p className="text-sm text-foreground/60">
            No groups are open for matching right now.
          </p>
        )}

        {(groups ?? []).map((group) => {
          const filled = Math.min(group.member_count / group.target_size, 1);
          return (
            <Link key={group.id} href={`/groups/${group.id}/reserve`}>
              <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft-md)]">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">{group.name}</h2>
                  <span className="text-xs uppercase tracking-wide text-accent">
                    {group.group_type === "rotating" ? "Rotating" : "Event"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground/70">
                  {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
                  {group.frequency}
                </p>
                {group.admin_name && (
                  <p className="mt-0.5 text-xs text-foreground/50">
                    Organized by {group.admin_name}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${filled * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-foreground/50">
                    {group.member_count}/{group.target_size} filled
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
