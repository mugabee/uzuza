"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

type Profile = { id: string; full_name: string | null } | null;

type Reservation = {
  id: string;
  user_id: string;
  fee_amount: number;
  status: "pending" | "submitted" | "confirmed" | "refunded";
  transaction_id: string | null;
  screenshot_path: string | null;
  profile: Profile;
};

type Group = {
  id: string;
  name: string;
  group_type: "rotating" | "event";
  contribution_amount: number;
  frequency: string;
  target_size: number;
};

type Member = { user_id: string; role: string; profile: Profile };

export function FormingGroupView({
  group,
  isAdmin,
  members,
  reservations,
}: {
  group: Group;
  isAdmin: boolean;
  members: Member[];
  reservations: Reservation[];
}) {
  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <Card>
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          Forming
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
          {group.name}
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          {Number(group.contribution_amount).toLocaleString()} RWF /{" "}
          {group.frequency}, {members.length}/{group.target_size} members
        </p>
        <Link
          href={`/groups/${group.id}/chat`}
          className="mt-4 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Chat with the group →
        </Link>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">
          Members
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between text-sm">
              <span>{m.profile?.full_name ?? "Member"}</span>
              <span className="text-xs capitalize text-foreground/50">{m.role}</span>
            </li>
          ))}
        </ul>
      </Card>

      {reservations.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-primary">
            Reservations
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {reservations.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.profile?.full_name ?? "Member"}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isAdmin &&
        reservations
          .filter((r) => r.status === "submitted")
          .map((r) => <AdminReservationRow key={r.id} reservation={r} />)}
    </div>
  );
}

function StatusBadge({ status }: { status: Reservation["status"] }) {
  const styles: Record<Reservation["status"], string> = {
    pending: "bg-black/5 text-foreground/60",
    submitted: "bg-accent/15 text-accent",
    confirmed: "bg-primary/15 text-primary",
    refunded: "bg-red-100 text-red-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function AdminReservationRow({ reservation }: { reservation: Reservation }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  async function handleViewScreenshot() {
    if (!reservation.screenshot_path) return;
    const supabase = createClient();
    const { data, error: urlError } = await supabase.storage
      .from("reservation-proofs")
      .createSignedUrl(reservation.screenshot_path, 60);
    if (urlError) {
      setError(urlError.message);
      return;
    }
    setScreenshotUrl(data.signedUrl);
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("confirm_reservation", {
      p_reservation_id: reservation.id,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="font-medium">{reservation.profile?.full_name ?? "Member"}</span>
        <span className="text-sm text-foreground/70">
          {Number(reservation.fee_amount).toLocaleString()} RWF
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground/70">
        txn: {reservation.transaction_id}
      </p>

      {reservation.screenshot_path && !screenshotUrl && (
        <button
          type="button"
          onClick={handleViewScreenshot}
          className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          View screenshot
        </button>
      )}
      {screenshotUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={screenshotUrl}
          alt="Payment screenshot"
          className="mt-2 max-h-64 rounded-lg border border-black/10"
        />
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <Button className="mt-4 w-full" onClick={handleConfirm} disabled={busy}>
        {busy ? "Confirming..." : "Confirm reservation"}
      </Button>
    </Card>
  );
}
