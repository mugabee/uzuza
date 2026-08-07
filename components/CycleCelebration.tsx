"use client";

import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export function CycleCelebration({
  groupId,
  cycleId,
  groupName,
  cycleNumber,
  totalSaved,
  memberCount,
  disputeCount,
  recipientName,
}: {
  groupId: string;
  cycleId: string;
  groupName: string;
  cycleNumber: number;
  totalSaved: number;
  memberCount: number;
  disputeCount: number;
  recipientName: string;
}) {
  const shareText =
    `${groupName} just completed cycle ${cycleNumber}. ` +
    `${totalSaved.toLocaleString()} RWF saved together across ${memberCount} members` +
    (disputeCount > 0 ? `, ${disputeCount} disputed this round` : ", no disputes") +
    `. Payout sent to ${recipientName}.`;

  return (
    <Card className="border border-accent/30 bg-accent/5">
      <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
        Cycle {cycleNumber} complete
      </span>
      <h2 className="mt-3 font-display text-xl font-semibold text-primary">
        {totalSaved.toLocaleString()} RWF saved together
      </h2>
      <dl className="mt-3 flex gap-6 text-sm">
        <div>
          <dt className="text-foreground/50">Members</dt>
          <dd className="font-medium text-foreground">{memberCount}</dd>
        </div>
        <div>
          <dt className="text-foreground/50">Disputes</dt>
          <dd className="font-medium text-foreground">{disputeCount}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-foreground/70">
        Payout sent to {recipientName}.
      </p>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button variant="secondary" className="mt-4 w-full">
          Share to WhatsApp
        </Button>
      </a>
      <Link
        href={`/groups/${groupId}/cycles/${cycleId}/summary`}
        className="mt-3 block text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        View full summary
      </Link>
    </Card>
  );
}
