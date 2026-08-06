"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  proposeSettingsChangeSchema,
  type ProposeSettingsChangeInput,
} from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

type Proposal = {
  id: string;
  change_type: "settings" | "role_change";
  payload: Record<string, string | number>;
  status: "pending" | "applied" | "rejected";
  created_at: string;
};

export function ProposalsPanel({
  groupId,
  proposals,
}: {
  groupId: string;
  proposals: Proposal[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ProposeSettingsChangeInput>({
    resolver: zodResolver(proposeSettingsChangeSchema),
  });

  async function onPropose(values: ProposeSettingsChangeInput) {
    setError(null);
    const payload: Record<string, string | number> = {};
    if (values.contributionAmount) payload.contribution_amount = values.contributionAmount;
    if (values.targetSize) payload.target_size = values.targetSize;
    if (values.approvalThreshold) payload.approval_threshold = values.approvalThreshold;
    if (values.momoNumber) payload.momo_number = values.momoNumber;

    if (Object.keys(payload).length === 0) {
      setError("Change at least one field");
      return;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("propose_group_change", {
      p_group_id: groupId,
      p_change_type: "settings",
      p_payload: payload,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setShowForm(false);
    router.refresh();
  }

  async function handleApprove(proposalId: string) {
    setBusyId(proposalId);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("approve_group_change", {
      p_proposal_id: proposalId,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  const pending = proposals.filter((p) => p.status === "pending");

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Proposed changes
      </h2>

      {pending.length === 0 && (
        <p className="mt-2 text-sm text-foreground/50">No pending proposals.</p>
      )}
      <ul className="mt-2 flex flex-col gap-3">
        {pending.map((p) => (
          <li key={p.id} className="rounded-lg bg-black/5 p-3 text-sm">
            <p className="text-foreground/80">
              {Object.entries(p.payload)
                .map(([k, v]) => `${k.replace(/_/g, " ")} → ${v}`)
                .join(", ")}
            </p>
            <p className="mt-1 text-xs text-foreground/50">
              Proposed {new Date(p.created_at).toLocaleDateString()}
            </p>
            <Button
              className="mt-2"
              onClick={() => handleApprove(p.id)}
              disabled={busyId === p.id}
            >
              {busyId === p.id ? "Approving..." : "Approve"}
            </Button>
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-3 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Propose a change
        </button>
      ) : (
        <form onSubmit={handleSubmit(onPropose)} className="mt-3 flex flex-col gap-2">
          <Field
            label="New contribution amount (optional)"
            type="number"
            {...register("contributionAmount")}
          />
          <Field label="New target size (optional)" type="number" {...register("targetSize")} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">
              New approval threshold (optional)
            </span>
            <select
              className="rounded-lg border border-black/10 px-4 py-2.5 outline-none focus:border-primary"
              {...register("approvalThreshold")}
              defaultValue=""
            >
              <option value="">No change</option>
              <option value="1">1 admin</option>
              <option value="2-of-3">2-of-3</option>
              <option value="all">All admins</option>
            </select>
          </label>
          <Field label="New MoMo number (optional)" {...register("momoNumber")} />
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit proposal"}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
