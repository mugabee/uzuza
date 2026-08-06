"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { momoNumberSchema } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { ContributeCard } from "@/components/ContributeCard";
import { AdminConfirmRow } from "@/components/AdminConfirmRow";
import { PayoutPanel } from "@/components/PayoutPanel";

type Profile = { id: string; full_name: string | null; phone: string | null } | null;

type Member = { user_id: string; role: string; profile: Profile };

type Contribution = {
  id: string;
  member_id: string;
  unique_reference: string;
  amount: number;
  status: "pending" | "submitted" | "confirmed" | "rejected";
  transaction_id: string | null;
  screenshot_path: string | null;
  rejected_reason: string | null;
  profile: Profile;
};

type Group = {
  id: string;
  name: string;
  group_type: "rotating" | "event";
  contribution_amount: number;
  frequency: string;
  target_size: number;
  momo_number: string | null;
  created_by: string;
};

type Cycle = {
  id: string;
  cycle_number: number;
  status: "active" | "completed";
  recipient_user_id: string;
  started_at: string;
} | null;

type PayoutRequest = {
  id: string;
  amount: number;
  status: "pending" | "approved" | "completed";
  recipient_user_id: string;
} | null;

export function GroupLedger({
  group,
  currentUserId,
  isMember,
  isAdmin,
  members,
  activeCycle,
  contributions,
  completedCycle,
  payoutRequest,
  payoutApprovalCount,
  currentUserHasApprovedPayout,
  recipientName,
}: {
  group: Group;
  currentUserId: string;
  isMember: boolean;
  isAdmin: boolean;
  members: Member[];
  activeCycle: Cycle;
  contributions: Contribution[];
  completedCycle: Cycle;
  payoutRequest: PayoutRequest;
  payoutApprovalCount: number;
  currentUserHasApprovedPayout: boolean;
  recipientName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("join_group", {
      p_group_id: group.id,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  async function handleStartCycle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("start_cycle", {
      p_group_id: group.id,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  if (!isMember) {
    return (
      <Card className="max-w-sm">
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          {group.group_type === "rotating" ? "Rotating Savings" : "Event Contribution"}
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>
        <p className="mt-2 text-sm text-foreground/70">
          {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
          {group.frequency}, {members.length}/{group.target_size} members
        </p>
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        <Button className="mt-6 w-full" onClick={handleJoin} disabled={busy}>
          {busy ? "Joining..." : "Join this group"}
        </Button>
      </Card>
    );
  }

  const myContribution = contributions.find((c) => c.member_id === currentUserId);

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <Card>
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          {group.group_type === "rotating" ? "Rotating Savings" : "Event Contribution"}
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
          {group.frequency}, {members.length}/{group.target_size} members
        </p>

        <p className="mt-4 break-all text-xs text-foreground/50">
          Invite link: {typeof window !== "undefined" ? window.location.href : ""}
        </p>

        <Link
          href={`/groups/${group.id}/constitution`}
          className="mt-2 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          View group constitution
        </Link>

        {isAdmin && <MomoNumberEditor group={group} />}

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        {isAdmin && !activeCycle && (
          <Button className="mt-4 w-full" onClick={handleStartCycle} disabled={busy}>
            {busy
              ? "Starting..."
              : completedCycle
                ? "Start Next Cycle"
                : "Start Cycle"}
          </Button>
        )}

        {completedCycle && (
          <p className="mt-4 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary">
            Cycle {completedCycle.cycle_number} complete — every contribution
            confirmed.{" "}
            <Link
              href={`/groups/${group.id}/cycles/${completedCycle.id}/summary`}
              className="underline underline-offset-2"
            >
              View summary
            </Link>
          </p>
        )}
      </Card>

      {activeCycle && myContribution && (
        <ContributeCard
          contribution={myContribution}
          groupMomoNumber={group.momo_number}
          onSubmitted={() => router.refresh()}
        />
      )}

      {activeCycle && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-primary">
            Cycle {activeCycle.cycle_number} ledger
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {contributions.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {c.profile?.full_name ?? "Member"}
                  {c.member_id === activeCycle.recipient_user_id && (
                    <span className="ml-1 text-xs text-accent">(receiving)</span>
                  )}
                </span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isAdmin &&
        contributions
          .filter((c) => c.status === "submitted")
          .map((c) => (
            <AdminConfirmRow
              key={c.id}
              contribution={c}
              onDecided={() => router.refresh()}
            />
          ))}

      {completedCycle && (
        <PayoutPanel
          cycleId={completedCycle.id}
          isAdmin={isAdmin}
          payoutRequest={payoutRequest}
          approvalCount={payoutApprovalCount}
          hasApproved={currentUserHasApprovedPayout}
          recipientName={recipientName}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Contribution["status"] }) {
  const styles: Record<Contribution["status"], string> = {
    pending: "bg-black/5 text-foreground/60",
    submitted: "bg-accent/15 text-accent",
    confirmed: "bg-primary/15 text-primary",
    rejected: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function MomoNumberEditor({ group }: { group: Group }) {
  const router = useRouter();
  const [value, setValue] = useState(group.momo_number ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    const result = momoNumberSchema.safeParse(value);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_group_momo_number", {
      p_group_id: group.id,
      p_momo_number: result.data,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 flex items-end gap-2">
      <Field
        label="Group MoMo number"
        placeholder="+250788123456"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error ?? undefined}
        className="flex-1"
      />
      <Button
        variant="secondary"
        onClick={handleSave}
        disabled={saving}
        className="mb-[1px]"
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
