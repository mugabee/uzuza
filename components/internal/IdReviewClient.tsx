"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type IdRequest = {
  id: string;
  user_id: string;
  full_name: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
};

export function IdReviewClient({ requests }: { requests: IdRequest[] }) {
  const router = useRouter();

  async function handleDecide(id: string, approve: boolean) {
    const supabase = createClient();
    await supabase.rpc("decide_id_verification", { p_id: id, p_approve: approve });
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");

  if (pending.length === 0) {
    return (
      <p className="text-sm text-foreground/50">
        No pending ID verification requests. This is expected — there is no
        submission flow anywhere in the app yet that would create one. This
        queue exists as an interim manual review path until a real NIDA API
        partnership exists (see <code>CLAUDE.md</code>); building a
        submission/collection flow now, without that partnership, would mean
        storing sensitive ID data with nowhere real to send it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.map((r) => (
        <Card key={r.id}>
          <p className="text-sm font-medium text-foreground">
            {r.full_name ?? "Unnamed user"}
          </p>
          <p className="text-xs text-foreground/50">{r.user_id}</p>
          <p className="mt-1 text-xs text-foreground/50">
            Requested {new Date(r.requested_at).toLocaleString()}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => handleDecide(r.id, true)}>Approve</Button>
            <Button variant="secondary" onClick={() => handleDecide(r.id, false)}>
              Reject
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
