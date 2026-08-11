"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

type Payment = {
  id: string;
  description: string;
  amount: number | null;
  status: "open" | "resolved";
  created_at: string;
};

export function UnmatchedPaymentsClient({ payments }: { payments: Payment[] }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLog() {
    if (!description.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("log_unmatched_payment", {
      p_description: description,
      p_amount: amount ? Number(amount) : null,
    });
    setBusy(false);
    setDescription("");
    setAmount("");
    router.refresh();
  }

  async function handleResolve(id: string) {
    const supabase = createClient();
    await supabase.rpc("resolve_unmatched_payment", { p_id: id });
    router.refresh();
  }

  const open = payments.filter((p) => p.status === "open");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Log a payment
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <Field
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. MoMo alert for 25,000 RWF, no matching reference found"
          />
          <Field
            label="Amount (optional)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button onClick={handleLog} disabled={busy}
            loading={busy}>
            {busy ? "Logging..." : "Log payment"}
          </Button>
        </div>
      </Card>

      {open.length === 0 ? (
        <p className="text-sm text-foreground/50">No open unmatched payments.</p>
      ) : (
        open.map((p) => (
          <Card key={p.id}>
            <p className="text-sm text-foreground/80">{p.description}</p>
            {p.amount != null && (
              <p className="mt-1 text-sm font-medium">
                {Number(p.amount).toLocaleString()} RWF
              </p>
            )}
            <Button className="mt-2" onClick={() => handleResolve(p.id)}>
              Mark resolved
            </Button>
          </Card>
        ))
      )}
    </div>
  );
}
