import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";

type ReconciliationRow = {
  entry_id: string;
  source: "reservation" | "contribution";
  amount: number;
  held_at: string;
  swept_at: string | null;
  payment_channel: "momo_manual" | "international_manual" | "momo_remittance" | "card_gateway" | null;
  payer_currency: string | null;
  payer_amount: number | null;
};

export default async function CustodyReconciliationPage({
  params,
}: PageProps<"/groups/[id]/custody">) {
  const { id } = await params;
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

  const { data: rows, error } = (await supabase.rpc("get_custody_reconciliation", {
    p_group_id: id,
  })) as { data: ReconciliationRow[] | null; error: { message: string } | null };

  if (error) redirect(`/groups/${id}`);

  const held = (rows ?? []).filter((r) => !r.swept_at);
  const swept = (rows ?? []).filter((r) => r.swept_at);
  const heldTotal = held.reduce((s, r) => s + Number(r.amount), 0);
  const sweptTotal = swept.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Link
          href={`/groups/${id}`}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          ← Back to group
        </Link>

        <Card>
          <h1 className="font-display text-xl font-semibold text-primary">
            {group.name} — Custody Reconciliation
          </h1>
          <div className="mt-3 flex gap-4 text-sm">
            <span>
              <strong>{heldTotal.toLocaleString()} RWF</strong>{" "}
              <span className="text-foreground/60">held</span>
            </span>
            <span>
              <strong>{sweptTotal.toLocaleString()} RWF</strong>{" "}
              <span className="text-foreground/60">swept</span>
            </span>
          </div>
        </Card>

        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {(rows ?? []).length === 0 && (
              <li className="text-foreground/50">No custody entries yet.</li>
            )}
            {(rows ?? []).map((r) => (
              <li key={r.entry_id} className="flex flex-col gap-1 border-b border-black/5 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="capitalize text-foreground/70">{r.source}</span>
                  <span>{Number(r.amount).toLocaleString()} RWF</span>
                  <span
                    className={
                      r.swept_at
                        ? "text-xs text-primary"
                        : "text-xs text-accent"
                    }
                  >
                    {r.swept_at ? "Swept" : "Held"}
                  </span>
                </div>
                {r.payment_channel && r.payment_channel !== "momo_manual" && (
                  <div className="flex items-center gap-2 text-xs text-foreground/50">
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent">
                      {r.payment_channel === "momo_remittance"
                        ? "🌍 MTN Remittance"
                        : r.payment_channel === "card_gateway"
                          ? "💳 Card/Gateway"
                          : "🌍 International"}
                    </span>
                    {r.payer_amount != null && r.payer_currency && (
                      <span>
                        sender paid ≈ {Number(r.payer_amount).toLocaleString()} {r.payer_currency}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
