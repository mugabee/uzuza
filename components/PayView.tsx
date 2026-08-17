"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { PullToRefresh } from "@/components/PullToRefresh";
import { BottomSheet } from "@/components/BottomSheet";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";
import { compressImage } from "../lib/compress-image";

type FoundUser = { id: string; full_name: string | null; phone: string | null };

type PaymentChannel = "momo_manual" | "wallet_balance" | "international_manual" | "momo_remittance" | "card_gateway";

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
  payment_channel: PaymentChannel;
  transaction_id: string | null;
  screenshot_path: string | null;
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

export function PayView({
  initialRequests,
  walletBalance,
}: {
  initialRequests: P2PRequest[];
  walletBalance: number;
}) {
  const [contact, setContact] = useState("");
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<FoundUser | null | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"request" | "send">("request");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"wallet_balance" | "momo_manual">("momo_manual");
  const [creating, setCreating] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofSheetId, setProofSheetId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [viewingScreenshot, setViewingScreenshot] = useState<{ id: string; url: string } | null>(null);
  const showToast = useToast();

  const amountNum = Number(amount);
  const insufficientForWalletSend =
    method === "wallet_balance" && direction === "send" && amountNum > 0 && amountNum > walletBalance;

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
    if (!amountNum || amountNum <= 0) {
      setLookupError("Enter an amount greater than 0");
      return;
    }
    if (insufficientForWalletSend) {
      setLookupError("That's more than your available wallet balance");
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
      p_payment_channel: method,
    });
    setCreating(false);
    if (error) {
      setLookupError(friendlyError(error.message));
      return;
    }
    showToast(
      method === "wallet_balance" && direction === "send"
        ? "Sent from your wallet"
        : direction === "request"
          ? "Request sent"
          : "Marked to send",
    );
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

  function openProofSheet(id: string) {
    setProofSheetId(id);
    setTransactionId("");
    setScreenshot(null);
    setProofError(null);
  }

  async function handleSubmitProof() {
    if (!proofSheetId || !screenshot || !transactionId.trim()) {
      setProofError("Enter the transaction ID and attach a screenshot");
      return;
    }
    setSubmittingProof(true);
    setProofError(null);
    const supabase = createClient();

    const fileToUpload = await compressImage(screenshot);
    const path = `${proofSheetId}/${Date.now()}-${screenshot.name}`;
    const { error: uploadError } = await supabase.storage.from("p2p-proofs").upload(path, fileToUpload);
    if (uploadError) {
      setSubmittingProof(false);
      setProofError(friendlyError(uploadError.message));
      return;
    }

    const { error } = await supabase.rpc("mark_p2p_paid", {
      p_id: proofSheetId,
      p_transaction_id: transactionId.trim(),
      p_screenshot_path: path,
    });
    setSubmittingProof(false);
    if (error) {
      setProofError(friendlyError(error.message));
      return;
    }
    showToast("Proof submitted");
    setProofSheetId(null);
    await refreshRequests();
  }

  async function handleViewScreenshot(r: P2PRequest) {
    if (!r.screenshot_path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("p2p-proofs").createSignedUrl(r.screenshot_path, 60);
    if (error) {
      showToast(friendlyError(error.message), "error");
      return;
    }
    setViewingScreenshot({ id: r.id, url: data.signedUrl });
  }

  return (
    <PullToRefresh onRefresh={refreshRequests}>
    <div className="flex flex-col gap-5">
      <Card>
        <h2 className="font-display text-lg font-semibold text-primary">Find someone</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Search by their exact phone number or email, then choose how the money moves —
          straight from your Uzuza wallet, or directly via MoMo outside the app with a shared
          proof record here.
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

            <div>
              <span className="text-sm font-medium text-foreground">How should the money move?</span>
              <div className="mt-1.5 flex gap-1 rounded-full bg-surface p-1 text-sm font-medium">
                {(["wallet_balance", "momo_manual"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex-1 rounded-full py-2 transition-all duration-200 ${
                      method === m
                        ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                        : "text-foreground/60 hover:text-foreground/80"
                    }`}
                  >
                    {m === "wallet_balance" ? "Uzuza wallet" : "Offline MoMo"}
                  </button>
                ))}
              </div>
              {method === "wallet_balance" ? (
                <p className="mt-1.5 text-xs text-foreground/50">
                  Available balance: {walletBalance.toLocaleString()} RWF.{" "}
                  {direction === "send"
                    ? "Sent immediately — no MoMo transfer needed."
                    : "They'll pay from their own wallet once they approve."}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-foreground/50">
                  Pay or get paid directly via MoMo, outside the app — Uzuza wallet balances
                  aren't affected either way.
                </p>
              )}
            </div>

            <Field
              label="Amount (RWF)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={insufficientForWalletSend ? "More than your available wallet balance" : undefined}
            />
            <Field
              label="Note (optional)"
              placeholder="What's this for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {lookupError && <p role="alert" className="text-xs text-danger">{lookupError}</p>}
            <Button onClick={handleCreate} disabled={creating || insufficientForWalletSend} loading={creating}>
              {creating
                ? "Sending..."
                : method === "wallet_balance" && direction === "send"
                  ? "Send from wallet"
                  : direction === "request"
                    ? "Send request"
                    : "Mark to send"}
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

                <span className="text-[10px] font-medium uppercase tracking-wide text-foreground/40">
                  {r.payment_channel === "wallet_balance" ? "Uzuza wallet" : "Offline MoMo"}
                </span>

                {r.status === "pending" && r.am_payer && r.payment_channel === "momo_manual" && (
                  <p className="text-xs text-foreground/50">
                    Pay {r.counterparty_name}{r.counterparty_phone ? ` (${r.counterparty_phone})` : ""} directly via MoMo,
                    then submit proof below. Reference: <span className="font-mono">{r.reference}</span>
                  </p>
                )}
                {r.status === "pending" && r.am_payer && r.payment_channel === "wallet_balance" && (
                  <p className="text-xs text-foreground/50">
                    Pay {r.counterparty_name} instantly from your available balance
                    ({walletBalance.toLocaleString()} RWF).
                  </p>
                )}
                {r.status === "paid" && !r.am_payer && (
                  <div className="flex items-center justify-between gap-2 text-xs text-foreground/50">
                    <span>{r.counterparty_name} submitted proof of payment — confirm once you've received it.</span>
                    {r.screenshot_path && (
                      <button
                        type="button"
                        onClick={() => handleViewScreenshot(r)}
                        className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
                      >
                        View proof
                      </button>
                    )}
                  </div>
                )}
                {viewingScreenshot?.id === r.id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={viewingScreenshot.url}
                    alt="Submitted payment screenshot"
                    className="max-h-64 rounded-lg border border-border"
                  />
                )}

                <div className="flex gap-2">
                  {r.status === "pending" && r.am_payer && r.payment_channel === "wallet_balance" && (
                    <Button
                      className="flex-1"
                      onClick={() => handleAction(r.id, "pay_p2p_from_wallet")}
                      disabled={busyId === r.id || Number(r.amount) > walletBalance}
                      loading={busyId === r.id}
                    >
                      {Number(r.amount) > walletBalance ? "Insufficient balance" : "Pay from wallet"}
                    </Button>
                  )}
                  {r.status === "pending" && r.am_payer && r.payment_channel === "momo_manual" && (
                    <Button className="flex-1" onClick={() => openProofSheet(r.id)}>
                      Submit proof
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

      <BottomSheet open={proofSheetId !== null} onClose={() => setProofSheetId(null)} title="Submit payment proof">
        <div className="flex flex-col gap-3">
          <Field
            label="Transaction ID"
            placeholder="e.g. MP240613.1234.A56789"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Screenshot</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
              onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
            />
          </label>
          {proofError && <p role="alert" className="text-xs text-danger">{proofError}</p>}
          <Button onClick={handleSubmitProof} disabled={submittingProof} loading={submittingProof}>
            {submittingProof ? "Submitting..." : "Submit proof"}
          </Button>
        </div>
      </BottomSheet>
    </div>
    </PullToRefresh>
  );
}
