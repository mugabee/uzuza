"use client";

import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

// The signature moment: a ring of dots, one per member, with a thin
// stroke tracing itself closed on mount - the rotation has gone all
// the way around the group and arrived back at the top, where the
// recipient's dot sits. This is the actual mechanic of an ikimina
// (contribute in turn, the pot rotates to one member each cycle), not
// a decorative flourish borrowed from somewhere else - the ring closing
// IS the thing being celebrated. Capped at a reasonable dot count for
// large groups; the ring is symbolic of "everyone had a turn," not a
// literal seating chart, so this doesn't need to map one dot per real
// member beyond what's visually legible.
const MAX_DOTS = 10;
const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function RotationRing({ memberCount, recipientName }: { memberCount: number; recipientName: string }) {
  const dotCount = Math.max(3, Math.min(memberCount, MAX_DOTS));
  const dots = Array.from({ length: dotCount }, (_, i) => {
    // Start at 12 o'clock (recipient's position) and go clockwise.
    const angle = (i / dotCount) * 2 * Math.PI - Math.PI / 2;
    return {
      x: 80 + RADIUS * Math.cos(angle),
      y: 80 + RADIUS * Math.sin(angle),
      isRecipient: i === 0,
    };
  });

  return (
    <div className="flex flex-col items-center">
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        aria-hidden="true"
        style={{ "--circle-circumference": CIRCUMFERENCE } as React.CSSProperties}
      >
        <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="1.5" />
        <circle
          cx="80"
          cy="80"
          r={RADIUS}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          className="animate-trace-circle-closed"
          transform="rotate(-90 80 80)"
        />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.isRecipient ? 7 : 4}
            fill={d.isRecipient ? "var(--accent)" : "var(--primary)"}
            opacity={d.isRecipient ? 1 : 0.5}
          />
        ))}
      </svg>
      <p className="-mt-2 text-sm font-medium text-foreground">
        The pot went to <span className="text-accent">{recipientName}</span>
      </p>
      <p className="sr-only">
        This cycle&apos;s rotation is complete — every member contributed, and the payout was sent to{" "}
        {recipientName}.
      </p>
    </div>
  );
}

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
      <div className="flex items-center justify-between">
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          Cycle {cycleNumber} complete
        </span>
      </div>

      <div className="mt-4">
        <RotationRing memberCount={memberCount} recipientName={recipientName} />
      </div>

      <h2 className="mt-4 text-center font-display text-xl font-semibold text-primary">
        {totalSaved.toLocaleString()} RWF saved together
      </h2>
      <dl className="mt-3 flex justify-center gap-6 text-sm">
        <div className="text-center">
          <dt className="text-foreground/50">Members</dt>
          <dd className="font-medium text-foreground">{memberCount}</dd>
        </div>
        <div className="text-center">
          <dt className="text-foreground/50">Disputes</dt>
          <dd className="font-medium text-foreground">{disputeCount}</dd>
        </div>
      </dl>
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
