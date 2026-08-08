import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SavingsJourneyCard } from "@/components/SavingsJourneyCard";
import { IntroCard } from "@/components/IntroCard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  const { data: journeyRows } = await supabase.rpc("get_lifetime_savings_summary");
  const journey = journeyRows?.[0];

  if (!memberships || memberships.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <IntroCard />
          {journey && Number(journey.total_saved) > 0 && (
            <SavingsJourneyCard
              totalSaved={Number(journey.total_saved)}
              cyclesCompleted={journey.cycles_completed}
              currentStreak={journey.current_streak}
              groupsCount={journey.groups_count}
            />
          )}
          <Card className="text-center">
            <h1 className="font-display text-2xl font-semibold text-primary">
              No groups yet
            </h1>
            <p className="mt-2 text-sm text-foreground/70">
              Create your first savings or event group to get started.
            </p>
            <Link href="/groups/new">
              <Button className="mt-6 w-full">Create a group</Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  const groupIds = memberships.map((m) => m.group_id);

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, group_type, contribution_amount, frequency")
    .in("id", groupIds);

  const { data: activeCycles } = await supabase
    .from("cycles")
    .select("id, group_id, recipient_user_id")
    .in("group_id", groupIds)
    .eq("status", "active");

  const activeCycleIds = (activeCycles ?? []).map((c) => c.id);
  const { data: myContributions } = activeCycleIds.length
    ? await supabase
        .from("contributions")
        .select("cycle_id, amount, status, unique_reference")
        .in("cycle_id", activeCycleIds)
        .eq("member_id", user.id)
    : { data: [] };

  const weeklyTotal = (groups ?? [])
    .filter((g) => g.frequency === "weekly")
    .reduce((sum, g) => sum + Number(g.contribution_amount), 0);
  const monthlyTotal = (groups ?? [])
    .filter((g) => g.frequency === "monthly")
    .reduce((sum, g) => sum + Number(g.contribution_amount), 0);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <IntroCard />
        <Card>
          <h1 className="font-display text-2xl font-semibold text-primary">
            Your groups
          </h1>
          <div className="mt-3 flex gap-4 text-sm">
            {weeklyTotal > 0 && (
              <span>
                <strong>{weeklyTotal.toLocaleString()} RWF</strong>{" "}
                <span className="text-foreground/60">/ week</span>
              </span>
            )}
            {monthlyTotal > 0 && (
              <span>
                <strong>{monthlyTotal.toLocaleString()} RWF</strong>{" "}
                <span className="text-foreground/60">/ month</span>
              </span>
            )}
          </div>
        </Card>

        {journey && Number(journey.total_saved) > 0 && (
          <SavingsJourneyCard
            totalSaved={Number(journey.total_saved)}
            cyclesCompleted={journey.cycles_completed}
            currentStreak={journey.current_streak}
            groupsCount={journey.groups_count}
          />
        )}

        {(groups ?? []).map((group) => {
          const activeCycle = activeCycles?.find((c) => c.group_id === group.id);
          const myContribution = activeCycle
            ? myContributions?.find((c) => c.cycle_id === activeCycle.id)
            : null;
          const isRecipient = activeCycle?.recipient_user_id === user.id;

          return (
            <Link key={group.id} href={`/groups/${group.id}`}>
              <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft-md)]">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">{group.name}</h2>
                  <span className="text-xs uppercase tracking-wide text-accent">
                    {group.group_type === "rotating" ? "Rotating" : "Event"}
                  </span>
                </div>
                {myContribution ? (
                  <p className="mt-1 text-sm text-foreground/70">
                    Payment due: {Number(myContribution.amount).toLocaleString()}{" "}
                    RWF —{" "}
                    <span className="capitalize">{myContribution.status}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-foreground/50">
                    No active cycle
                  </p>
                )}
                {isRecipient && (
                  <p className="mt-1 text-xs font-medium text-accent">
                    You're receiving this cycle's payout
                  </p>
                )}
              </Card>
            </Link>
          );
        })}

        <Link href="/groups/new">
          <Button variant="secondary" className="w-full">
            Create another group
          </Button>
        </Link>
      </div>
    </main>
  );
}
