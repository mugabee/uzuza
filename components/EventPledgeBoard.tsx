"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { PayoutPanel } from "@/components/PayoutPanel";
import { MomoNumberEditor } from "@/components/MomoNumberEditor";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

type Group = {
  id: string;
  name: string;
  contribution_amount: number;
  pledge_goal?: number | null;
  momo_number?: string | null;
};

type PledgeRow = {
  pledge_id: string;
  display_name: string | null;
  display_amount: number | null;
  status: "pledged" | "submitted" | "confirmed" | "cancelled";
  is_own: boolean;
};

type PayoutRequest = {
  id: string;
  amount: number;
  status: "pending" | "approved" | "completed";
  recipient_user_id: string;
} | null;

export function EventPledgeBoard({
  group,
  isAdmin,
  pledges,
  total,
  payoutRequest,
  payoutApprovalCount,
  currentUserHasApprovedPayout,
  organizerName,
  signedIn,
}: {
  group: Group;
  isAdmin: boolean;
  pledges: PledgeRow[];
  total: number;
  payoutRequest: PayoutRequest;
  payoutApprovalCount: number;
  currentUserHasApprovedPayout: boolean;
  organizerName: string;
  signedIn: boolean;
}) {
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <Card>
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          Event Contribution
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>

        <div className="mt-3">
          <p className="text-2xl font-semibold text-foreground">
            {total.toLocaleString()} RWF
            {group.pledge_goal ? (
              <span className="text-sm font-normal text-foreground/50">
                {" "}
                / {Number(group.pledge_goal).toLocaleString()} RWF goal
              </span>
            ) : null}
          </p>
          {group.pledge_goal ? (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.min((total / Number(group.pledge_goal)) * 100, 100)}%`,
                }}
              />
            </div>
          ) : null}
        </div>

        <Link
          href={
            signedIn
              ? `/groups/${group.id}/pledge`
              : `/login?redirect=${encodeURIComponent(`/groups/${group.id}/pledge`)}`
          }
        >
          <Button className="mt-4 w-full">Pledge now</Button>
        </Link>
        {!signedIn && (
          <p className="mt-2 text-center text-xs text-foreground/50">
            You'll sign in or create a free account first, then come right
            back here to pledge.
          </p>
        )}

        {isAdmin && (
          <MomoNumberEditor
            groupId={group.id}
            currentNumber={group.momo_number ?? null}
          />
        )}

        {shareUrl && (
          <div className="mt-6 flex flex-col items-center gap-2 border-t border-black/10 pt-4">
            <p className="text-xs text-foreground/50">Share & invite</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
              alt="QR code to this event"
              width={160}
              height={160}
              className="rounded-lg border border-black/10"
            />
            <p className="break-all text-center text-xs text-foreground/50">{shareUrl}</p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Pledges
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {pledges.length === 0 && (
            <li className="text-sm text-foreground/50">No pledges yet.</li>
          )}
          {pledges.map((p) => (
            <li key={p.pledge_id} className="flex items-center justify-between text-sm">
              <span>
                {p.display_name ?? "Someone"}
                {p.is_own && <span className="ml-1 text-xs text-accent">(you)</span>}
              </span>
              <span className="flex items-center gap-2">
                {p.display_amount !== null && (
                  <span className="text-foreground/70">
                    {Number(p.display_amount).toLocaleString()} RWF
                  </span>
                )}
                <StatusBadge status={p.status} />
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin && <AdminPledgeQueue groupId={group.id} />}

      <PayoutPanel
        target={{ type: "event", groupId: group.id }}
        isAdmin={isAdmin}
        payoutRequest={payoutRequest}
        approvalCount={payoutApprovalCount}
        hasApproved={currentUserHasApprovedPayout}
        recipientName={organizerName}
        readyMessage="Ready whenever there are confirmed pledges to pay out."
      />
    </div>
  );
}

// Same WhatsApp-style tick convention as GroupLedger's StatusBadge — one
// tick submitted, two once confirmed.
function StatusBadge({ status }: { status: PledgeRow["status"] }) {
  const styles: Record<PledgeRow["status"], string> = {
    pledged: "bg-black/5 text-foreground/60",
    submitted: "bg-accent/15 text-accent",
    confirmed: "bg-primary/15 text-primary",
    cancelled: "bg-red-100 text-red-600",
  };
  const ticks: Record<PledgeRow["status"], string> = {
    pledged: "○",
    submitted: "✓",
    confirmed: "✓✓",
    cancelled: "✕",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      <span aria-hidden="true" className="font-sans tracking-tighter">{ticks[status]}</span>
      {status}
    </span>
  );
}

function AdminPledgeQueue({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<
    { id: string; pledger_id: string; amount: number; transaction_id: string | null; screenshot_path: string | null }[] | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  async function load() {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("event_pledges")
      .select("id, pledger_id, amount, transaction_id, screenshot_path")
      .eq("group_id", groupId)
      .eq("status", "submitted");
    if (fetchError) {
      setError(friendlyError(fetchError.message));
      return;
    }
    setRows(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm(pledgeId: string) {
    setBusyId(pledgeId);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("confirm_pledge", {
      p_pledge_id: pledgeId,
    });
    setBusyId(null);
    if (rpcError) {
      setError(friendlyError(rpcError.message));
      return;
    }
    showToast("Pledge confirmed");
    await load();
    router.refresh();
  }

  if (!rows || rows.length === 0) return null;

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Awaiting confirmation
      </h2>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-sm">
            <span>
              {Number(r.amount).toLocaleString()} RWF — txn: {r.transaction_id}
            </span>
            <Button
              onClick={() => handleConfirm(r.id)}
              disabled={busyId === r.id}
            >
              {busyId === r.id ? "Confirming..." : "Confirm"}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
