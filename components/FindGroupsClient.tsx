"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { PullToRefresh } from "@/components/PullToRefresh";

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

export function FindGroupsClient({ groups }: { groups: FindGroupResult[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "rotating" | "event">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (typeFilter !== "all" && g.group_type !== typeFilter) return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || g.admin_name?.toLowerCase().includes(q);
    });
  }, [groups, query, typeFilter]);

  return (
    <PullToRefresh onRefresh={() => router.refresh()}>
      <div className="flex flex-col gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by group or organizer name"
          className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-1 rounded-full bg-surface-secondary p-1 text-xs font-medium">
          {(["all", "rotating", "event"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`flex-1 rounded-full py-1.5 capitalize transition-all duration-200 ${
                typeFilter === t
                  ? "bg-surface text-primary shadow-[var(--shadow-soft)]"
                  : "text-foreground/60 hover:text-foreground/80"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            {groups.length === 0
              ? "No groups are open for matching right now."
              : "No groups match your search."}
          </p>
        )}

        {filtered.map((group) => {
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
                  {Number(group.contribution_amount).toLocaleString()} RWF / {group.frequency}
                </p>
                {group.admin_name && (
                  <p className="mt-0.5 text-xs text-foreground/50">Organized by {group.admin_name}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${filled * 100}%` }} />
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
    </PullToRefresh>
  );
}
