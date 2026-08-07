"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useLowDataMode } from "@/lib/low-data-mode";

export function InviteCard({ groupId }: { groupId: string }) {
  const [copied, setCopied] = useState(false);
  const lowData = useLowDataMode();
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/groups/${groupId}`
      : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Invite people
      </h2>
      <p className="mt-1 text-sm text-foreground/60">
        Share this link or QR code with anyone you want in the group. They
        will be able to join once they open it and sign in.
      </p>

      <div className="mt-4 flex flex-col items-center gap-3">
        {!lowData && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(inviteUrl)}`}
            alt="QR code to join this group"
            width={160}
            height={160}
            className="rounded-lg border border-black/10"
          />
        )}
        <p className="break-all text-center text-xs text-foreground/50">
          {inviteUrl}
        </p>
        <Button variant="secondary" className="w-full" onClick={handleCopy}>
          {copied ? "Copied" : "Copy invite link"}
        </Button>
      </div>
    </Card>
  );
}
