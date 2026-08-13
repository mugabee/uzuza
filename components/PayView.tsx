"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

type FoundUser = { id: string; full_name: string | null; phone: string | null };

type P2PRequest = {
  id: string;
  amount: number;
  note: string | null;
  status: "pending" | "paid" | "confirmed" | "declined" | "cancelled";
  reference: string;
  created_at: string;
  paid_at: string | null;
  confirmed_at: string | null;
  am_payer: boolean;
  am_initiator: boolean;
  counterparty_name: string;
  counterparty_phone: string | null;
};

const STATUS_LABEL: Record<P2PRequest["status"], string> = {
  pending: "Pending",
  paid: "Marked as paid",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<P2PRequest["status"], string> = {
  pending: "bg-accent/15 text-accent",
  paid: "bg-primary/10 text-primary",
  confirmed: "bg-success/15 text-success",
  declined: "bg-danger/15 text-danger",
  cancelled: "bg-foreground/10 text-foreground/50",
};

export function PayView({ initialRequests }: { initialRequests: P2PRequest[] }) {
  const [contact, setContact] = useState("");
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<FoundUser | null | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"request" | "send">("request");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const showToast = useToast();

  async function refreshRequests() {
    const supabase = createClient();
    const { data } = await supabase.rpc("list_my_p2p_requests");
    if (data) setRequests(data);
  }

  async function handleLookup() {
    if (!contact.trim()) return;
    setChecking(true);
    setLookupError(null);
    setFound(undefined);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("find_user_by_contact", { p_contact: contact.trim() });
    setChecking(false);
    if (error) {
      setLookupError(friendlyError(error.message));
      return;
    }
    setFound(data?.[0] ?? null);
  }

  async function handleCreate() {
    if (!found) return;
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setLookupError("Enter an amount greater than 0");
      return;
    }
    setCreating(true);
    setLookupError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_p2p_request", {
      p_contact: contact.trim(),
      p_direction: direction,
      p_amount: amountNum,
      p_note: note.trim() || null,
    });
    setCreating(false);
    if (error) {
      setLookupError(friendlyError(error.message));
      return;
    }
    showToast(direction === "request" ? "Request sent" : "Marked to send");
    setContact("");
    setFound(undefined);
    setAmount("");
    setNote("");
    await refreshRequests();
  }

  async function handleAction(id: string, rpc: string) {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc(rpc, { p_id: id });
    setBusyId(null);
    if (error) {
      showToast(friendlyError(error.message), "error");
      return;
    }
    await refreshRequests();
  }

  return (
    <PullToRefresh onRefresh={refreshRequests}>
    <div className="flex flex-col gap-5">
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">Find someone</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Search by their exact phone number or email — Uzuza never moves the money itself;
          you'll pay or get paid directly via MoMo, with a shared record here to confirm it.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={contact}
            onChange={(e) => {
              setContact(e.target.value);
              setFound(undefined);
            }}
            placeholder="+250788123456 or email"
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <Button variant="secondary" onClick={handleLookup} disabled={checking || !contact.trim()}>
            {checking ? "..." : "Find"}
          </Button>
        </div>

        {found === null && (
          <p className="mt-3 text-sm text-foreground/50">
            No Uzuza account found for that phone number or email.
          </p>
        )}

        {found && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-secondary p-3">
            <p className="text-sm">
              <span className="font-semibold text-foreground">{found.full_name ?? "Member"}</span>
            </p>

            <div className="flex gap-1 rounded-full bg-surface p-1 text-sm font-medium">
              {(["request", "send"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`flex-1 rounded-full py-2 transition-all duration-200 ${
                    direction === d
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                      : "text-foreground/60 hover:text-foreground/80"
                  }`}
                >
                  {d === "request" ? "Request from them" : "Send to them"}
                </button>
              ))}
            </div>

            <Field
              label="Amount (RWF)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Field
              label="Note (optional)"
              placeholder="What's this for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {lookupError && <p role="alert" className="text-xs text-danger">{lookupError}</p>}
            <Button onClick={handleCreate} disabled={creating} loading={creating}>
              {creating ? "Sending..." : direction === "request" ? "Send request" : "Mark to send"}
            </Button>
          </div>
        )}
        {found === undefined && lookupError && (
          <p role="alert" className="mt-3 text-xs text-danger">{lookupError}</p>
        )}
      </Card>

      <Card className="p-2">
        <h2 className="px-2 pt-1 font-display text-lg font-semibold text-primary">My requests</h2>
        {requests.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground/50">
            No money requests yet — find someone above to get started.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.am_payer ? "To" : "From"} {r.counterparty_name}
                      {r.counterparty_phone ? ` · ${r.counterparty_phone}` : ""}
                    </p>
                    {r.note && <p className="truncate text-xs text-foreground/50">{r.note}</p>}
                    <p className="text-xs text-foreground/40">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-foreground">
                      {Number(r.amount).toLocaleString()} RWF
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                </div>

                {r.status === "pending" && r.am_payer && (
                  <p className="text-xs text-foreground/50">
                    Pay {r.counterparty_name}{r.counterparty_phone ? ` (${r.counterparty_phone})` : ""} directly via MoMo,
                    then mark it below. Reference: <span className="font-mono">{r.reference}</span>
                  </p>
                )}
                {r.status === "paid" && !r.am_payer && (
                  <p className="text-xs text-foreground/50">
                    {r.counterparty_name} marked this as paid — confirm once you've received it.
                  </p>
                )}

                <div className="flex gap-2">
                  {r.status === "pending" && r.am_payer && (
                    <Button
                      className="flex-1"
                      onClick={() => handleAction(r.id, "mark_p2p_paid")}
                      disabled={busyId === r.id}
                      loading={busyId === r.id}
                    >
                      Mark as paid
                    </Button>
                  )}
                  {r.status === "pending" && r.am_payer && !r.am_initiator && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => handleAction(r.id, "decline_p2p_request")}
                      disabled={busyId === r.id}
                    >
                      Decline
                    </Button>
                  )}
                  {r.status === "pending" && r.am_initiator && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => handleAction(r.id, "cancel_p2p_request")}
                      disabled={busyId === r.id}
                    >
                      Cancel
                    </Button>
                  )}
                  {r.status === "paid" && !r.am_payer && (
                    <Button
                      className="flex-1"
                      onClick={() => handleAction(r.id, "confirm_p2p_received")}
                      disabled={busyId === r.id}
                      loading={busyId === r.id}
                    >
                      Confirm received
                    </Button>
                  )}
                  {r.status === "paid" && r.am_payer && (
                    <p className="flex-1 text-xs text-foreground/50">Waiting for {r.counterparty_name} to confirm.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
    </PullToRefresh>
  );
}
