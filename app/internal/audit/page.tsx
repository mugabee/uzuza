import { requireStaff } from "@/lib/staff-check";
import { Card } from "@/components/Card";

type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default async function InternalAuditPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("list_audit_log", { p_limit: 100 });
  const entries: AuditEntry[] = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Audit Log
      </h1>
      <p className="max-w-lg text-xs text-foreground/50">
        Every financial and governance action logged as it happens — payout
        approvals/completions, contribution confirmations into Uzuza
        custody, group-change proposals, exits, pauses, removals, and
        internal-console decisions. The most recent 100 entries.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-foreground/50">No audit entries yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <Card key={e.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{e.action}</span>
                <span className="text-xs text-foreground/50">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground/50">
                {e.entity_type}
                {e.entity_id ? ` · ${e.entity_id}` : ""}
                {e.actor_user_id ? ` · by ${e.actor_user_id}` : " · system"}
              </p>
              {Object.keys(e.metadata ?? {}).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-black/5 p-2 text-xs">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
