// Uzuza's mark: a circle with a small gap that's in the process of
// closing — the rotating pot / "completing each other" metaphor from the
// tagline, rendered as the simplest possible geometric shape rather than
// an invented illustration (design brief §3: no complex illustration as
// the logo). Reused as-is for the savings wheel's own visual language
// later, so the two feel like one system rather than two unrelated marks.
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="66 9"
        strokeDashoffset="-2"
      />
    </svg>
  );
}

export function Logo({
  size = 28,
  showTagline = false,
  className = "",
  markClassName = "text-primary",
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
  markClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} className={markClassName} />
      <div className="flex flex-col leading-tight">
        <span className="font-display text-lg font-bold tracking-tight text-primary">
          Uzuza
        </span>
        {showTagline && (
          <span className="text-[11px] font-medium text-foreground/50">Twuzuzanya</span>
        )}
      </div>
    </div>
  );
}
