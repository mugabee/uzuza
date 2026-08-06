"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type MediationCase = {
  id: string;
  group_name: string;
  raiser_name: string | null;
  reason: string;
  stakes: "financial" | "general";
  status: "open" | "closed";
  created_at: string;
};

export function MediationQueueClient({ cases }: { cases: MediationCase[] }) {
  const router = useRouter();

  async function handleClose(caseId: string) {
    const supabase = createClient();
    await supabase.rpc("close_mediation_case", { p_case_id: caseId });
    router.refresh();
  }

  const open = cases.filter((c) => c.status === "open");

  if (open.length === 0) {
    return <p className="text-sm text-foreground/50">No open mediation cases.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {open.map((c) => (
        <Card key={c.id}>
          <div className="flex items-center justify-between">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                c.stakes === "financial"
                  ? "bg-red-100 text-red-600"
                  : "bg-black/5 text-foreground/60"
              }`}
            >
              {c.stakes}
            </span>
            <span className="text-xs text-foreground/50">
              {new Date(c.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{c.group_name}</p>
          <p className="text-xs text-foreground/50">Raised by {c.raiser_name ?? "a member"}</p>
          <p className="mt-2 text-sm text-foreground/80">{c.reason}</p>
          <Button className="mt-3" onClick={() => handleClose(c.id)}>
            Close case
          </Button>
        </Card>
      ))}
    </div>
  );
}
