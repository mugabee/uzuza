// WhatsApp's own tick convention (design brief §2/§4) — chosen because
// it's already muscle memory for the whole target market, not because
// it's clever. Status is encoded by BOTH tick count and color, never
// color alone (brief §1.7 — don't rely on color alone for status):
// one grey tick = sent, two grey ticks = delivered/received, two green
// ticks = read/confirmed. A visually-hidden label carries the same
// information for screen readers, since the icon shape difference alone
// isn't announced by itself.
export type TickStatus = "sent" | "delivered" | "confirmed";

const LABEL: Record<TickStatus, string> = {
  sent: "Sent",
  delivered: "Delivered",
  confirmed: "Confirmed",
};

function Tick({ className }: { className: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M2 8.5l3 3 9-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusTicks({
  status,
  label,
  className = "",
}: {
  status: TickStatus;
  /** Override the default English label — pass a translated string for i18n contexts. */
  label?: string;
  className?: string;
}) {
  const color = status === "confirmed" ? "text-primary" : "text-foreground/35";

  return (
    <span className={`inline-flex items-center ${className}`}>
      <span className={`flex ${color}`}>
        <Tick className="shrink-0" />
        {status !== "sent" && <Tick className="-ml-2 shrink-0" />}
      </span>
      <span className="sr-only">{label ?? LABEL[status]}</span>
    </span>
  );
}
