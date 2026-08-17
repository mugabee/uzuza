"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ContributeCard } from "@/components/ContributeCard";
import { AdminConfirmRow } from "@/components/AdminConfirmRow";
import { PayoutPanel } from "@/components/PayoutPanel";
import { MediationButton } from "@/components/MediationButton";
import { MissedPaymentButton } from "@/components/MissedPaymentButton";
import { CycleCelebration } from "@/components/CycleCelebration";
import { LatePaymentCard } from "@/components/LatePaymentCard";
import { AdminLatePaymentRow } from "@/components/AdminLatePaymentRow";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CycleDueDateEditor } from "@/components/CycleDueDateEditor";
import { useLanguage } from "../lib/i18n";
import { usePoll } from "../lib/use-poll";

type Profile = { id: string; full_name: string | null; phone: string | null } | null;

type Member = { user_id: string; role: string; profile: Profile };

type Contribution = {
  id: string;
  member_id: string;
  unique_reference: string;
  amount: number;
  status:
    | "pending"
    | "submitted"
    | "confirmed"
    | "rejected"
    | "missed"
    | "late_submitted"
    | "paid_late";
  transaction_id: string | null;
  screenshot_path: string | null;
  rejected_reason: string | null;
  missed_fine_amount?: number | null;
  payment_channel?: "momo_manual" | "international_manual" | "momo_remittance" | "card_gateway";
  payer_currency?: string;
  payer_amount?: number | null;
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
  account_type: "group_owned" | "uzuza_held";
};

const UZUZA_CUSTODY_NUMBER = process.env.NEXT_PUBLIC_UZUZA_CUSTODY_MOMO_NUMBER;

type Cycle = {
  id: string;
  cycle_number: number;
  status: "active" | "completed";
  recipient_user_id: string;
  started_at: string;
  due_date: string | null;
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
  const [tab, setTab] = useState<"overview" | "ledger" | "members">("overview");
  const { t } = useLanguage();
  const showToast = useToast();
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());

  // Lightweight polling refresh so the ledger reflects what other admins
  // and members do without everyone needing to manually reload. Every tick
  // is a full server round-trip, so this stays infrequent (20s, not the
  // original 6s) - usePoll already skips entirely while the app is
  // backgrounded/hidden, which on mobile data was a real contributor to
  // the whole app feeling sluggish, not just this screen.
  usePoll(() => {
    router.refresh();
    setLastUpdated(new Date());
  }, 20000);

  // Ticks the "Updated Xs ago" label without re-fetching anything.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const secondsAgo = Math.max(0, Math.round((now.getTime() - lastUpdated.getTime()) / 1000));
  const updatedLabel =
    secondsAgo < 3 ? "Updated just now" : secondsAgo < 60 ? `Updated ${secondsAgo}s ago` : "Updating soon...";

  async function handleJoin() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("join_group", {
      p_group_id: group.id,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Joined the group");
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
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Cycle started");
    router.refresh();
  }

  async function handleConfirmAll() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const submitted = contributions.filter((c) => c.status === "submitted");
    for (const c of submitted) {
      await supabase.rpc("confirm_contribution", {
        p_contribution_id: c.id,
        p_approve: true,
        p_reason: null,
      });
    }
    setBusy(false);
    showToast(`Confirmed ${submitted.length} contribution${submitted.length === 1 ? "" : "s"}`);
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
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
        <Button className="mt-6 w-full" onClick={handleJoin} disabled={busy}
            loading={busy}>
          {busy ? t("joining") : t("joinThisGroup")}
        </Button>
      </Card>
    );
  }

  const myContribution = contributions.find((c) => c.member_id === currentUserId);
  const myPhone = members.find((m) => m.user_id === currentUserId)?.profile?.phone ?? "";

  return (
    <PullToRefresh
      onRefresh={() => {
        router.refresh();
        setLastUpdated(new Date());
      }}
    >
    <div className="flex w-full max-w-md flex-col gap-5">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            {group.group_type === "rotating" ? "Rotating Savings" : "Event Contribution"}
          </span>
          <div className="flex items-center gap-3">
            <Link
              href={`/groups/${group.id}/chat`}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Chat
            </Link>
            <Link
              href={`/groups/${group.id}/settings`}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Settings
            </Link>
          </div>
        </div>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
          {group.frequency}, {members.length}/{group.target_size} members
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground/40">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          {updatedLabel}
        </p>

        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}

        {isAdmin && !activeCycle && (
          <Button className="mt-4 w-full" onClick={handleStartCycle} disabled={busy}
            loading={busy}>
            {busy
              ? t("starting")
              : completedCycle
                ? t("startNextCycle")
                : t("startCycle")}
          </Button>
        )}

        {completedCycle && payoutRequest?.status !== "completed" && (
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

      <div className="flex gap-1 rounded-full bg-surface-secondary p-1 text-sm font-medium">
        {(
          [
            ["overview", "Overview"],
            ["ledger", group.group_type === "rotating" ? "Ledger" : "Contributions"],
            ["members", "Members"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              tab === key
                ? "bg-surface text-primary shadow-[var(--shadow-soft)]"
                : "text-foreground/60 hover:text-foreground/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeCycle && (
        <div className="-mt-2">
          <CycleDueDateEditor cycleId={activeCycle.id} dueDate={activeCycle.due_date} isAdmin={isAdmin} />
        </div>
      )}

      {tab === "overview" && (
        <>
      {group.account_type === "uzuza_held" && (
        <Link
          href={`/groups/${group.id}/custody`}
          className="flex items-center justify-between gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm font-medium text-foreground/80 transition-colors duration-150 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Where this group's money is held
          <span className="text-primary underline-offset-2">View reconciliation</span>
        </Link>
      )}
      {completedCycle && payoutRequest?.status === "completed" && (
        <CycleCelebration
          groupId={group.id}
          cycleId={completedCycle.id}
          groupName={group.name}
          cycleNumber={completedCycle.cycle_number}
          totalSaved={contributions
            .filter((c) => c.status === "confirmed")
            .reduce((sum, c) => sum + Number(c.amount), 0)}
          memberCount={members.length}
          disputeCount={contributions.filter((c) => c.status === "missed").length}
          recipientName={recipientName}
        />
      )}

      {completedCycle &&
        myContribution &&
        (myContribution.status === "missed" ||
          myContribution.status === "late_submitted" ||
          myContribution.status === "paid_late") && (
          <LatePaymentCard
            contribution={myContribution}
            groupMomoNumber={
              group.account_type === "uzuza_held"
                ? (UZUZA_CUSTODY_NUMBER ?? "Uzuza custody number (being finalized)")
                : group.momo_number
            }
            onSubmitted={() => router.refresh()}
          />
        )}

      {isAdmin &&
        completedCycle &&
        contributions
          .filter((c) => c.status === "late_submitted")
          .map((c) => (
            <AdminLatePaymentRow key={c.id} contribution={c} onDecided={() => router.refresh()} />
          ))}

      {activeCycle && myContribution && (
        <ContributeCard
          contribution={myContribution}
          groupMomoNumber={
            group.account_type === "uzuza_held"
              ? (UZUZA_CUSTODY_NUMBER ?? "Uzuza custody number (being finalized)")
              : group.momo_number
          }
          myPhone={myPhone}
          onSubmitted={() => router.refresh()}
        />
      )}
        </>
      )}

      {tab === "ledger" && !activeCycle && (
        <Card>
          <p className="text-sm text-foreground/60">No active cycle right now.</p>
        </Card>
      )}

      {tab === "ledger" && activeCycle && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">
              Cycle {activeCycle.cycle_number} ledger
            </h2>
            <span className="text-xs font-medium text-foreground/50">
              {contributions.filter((c) => c.status === "confirmed" || c.status === "paid_late").length}/
              {contributions.length} confirmed
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${
                  contributions.length
                    ? (contributions.filter((c) => c.status === "confirmed" || c.status === "paid_late").length /
                        contributions.length) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>

          <ul className="mt-4 flex flex-col divide-y divide-black/[0.05]">
            {contributions.map((c) => {
              const name = c.profile?.full_name ?? "Member";
              const initials = name
                .split(" ")
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const isPositive = c.status === "confirmed" || c.status === "paid_late";
              const isNegative = c.status === "rejected" || c.status === "missed";
              return (
                <li key={c.id} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isPositive
                        ? "bg-primary/10 text-primary"
                        : isNegative
                          ? "bg-danger/10 text-danger"
                          : "bg-accent/10 text-accent"
                    }`}
                  >
                    {initials || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {name}
                      {c.member_id === activeCycle.recipient_user_id && (
                        <span className="ml-1.5 text-xs font-normal text-accent">receiving</span>
                      )}
                    </p>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-semibold ${
                        isPositive ? "text-primary" : isNegative ? "text-danger" : "text-foreground/70"
                      }`}
                    >
                      {Number(c.amount).toLocaleString()} RWF
                    </span>
                    {isAdmin && c.status === "pending" && (
                      <MissedPaymentButton
                        contributionId={c.id}
                        onReported={() => router.refresh()}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === "members" && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">
              Members
            </h2>
            <Link
              href={`/groups/${group.id}/settings`}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Manage
            </Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between text-sm">
                <span>{m.profile?.full_name ?? "Member"}</span>
                <span className="text-xs capitalize text-foreground/50">{m.role}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "overview" && (
        <>
      {isAdmin && contributions.some((c) => c.status === "submitted") && (
        <Button variant="secondary" onClick={handleConfirmAll} disabled={busy}
            loading={busy}>
          {busy ? "Confirming..." : "Confirm all"}
        </Button>
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

      <Card>
        <MediationButton groupId={group.id} />
      </Card>

      {completedCycle && (
        <PayoutPanel
          target={{ type: "cycle", cycleId: completedCycle.id }}
          isAdmin={isAdmin}
          payoutRequest={payoutRequest}
          approvalCount={payoutApprovalCount}
          hasApproved={currentUserHasApprovedPayout}
          recipientName={recipientName}
          readyMessage="Cycle complete — every contribution confirmed."
        />
      )}
        </>
      )}
    </div>
    </PullToRefresh>
  );
}

// Ticks modeled on WhatsApp's sent/delivered pattern (familiar at a glance
// to the app's primary Rwanda/Uganda user base): one tick once a member
// has submitted proof, two once an admin has confirmed it — same
// metaphor as a message being sent vs. read.
function StatusBadge({ status }: { status: Contribution["status"] }) {
  const styles: Record<Contribution["status"], string> = {
    pending: "bg-surface-secondary text-foreground/60",
    submitted: "bg-accent/15 text-accent",
    confirmed: "bg-primary/15 text-primary",
    rejected: "bg-danger/15 text-danger",
    missed: "bg-danger/15 text-danger",
    late_submitted: "bg-accent/15 text-accent",
    paid_late: "bg-primary/15 text-primary",
  };
  const ticks: Partial<Record<Contribution["status"], string>> = {
    pending: "○",
    submitted: "✓",
    late_submitted: "✓",
    confirmed: "✓✓",
    paid_late: "✓✓",
    rejected: "✕",
    missed: "✕",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      <span aria-hidden="true" className="font-sans tracking-tighter">
        {ticks[status]}
      </span>
      {status.replace("_", " ")}
    </span>
  );
}

