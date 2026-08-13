"use client";

function streakTier(streak: number): { label: string; emoji: string; ring: string } {
  if (streak >= 12) return { label: "Unstoppable", emoji: "🏆", ring: "from-[#c9962c] to-[#a97a1e]" };
  if (streak >= 6) return { label: "On fire", emoji: "🔥", ring: "from-accent to-[#a97a1e]" };
  if (streak >= 3) return { label: "Building momentum", emoji: "⭐", ring: "from-primary to-accent" };
  return { label: "Getting started", emoji: "🌱", ring: "from-primary to-primary" };
}

export function StreakBadge({ streak, name }: { streak: number; name?: string | null }) {
  if (streak < 2) return null;

  const tier = streakTier(streak);
  const shareText = `${name ? `${name} is` : "I'm"} on a ${streak}-cycle savings streak with Uzuza ${tier.emoji} ${
    tier.label
  }!`;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-accent/25 bg-accent/5 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xl ${tier.ring}`}
          aria-hidden="true"
        >
          {tier.emoji}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{streak}-cycle streak</p>
          <p className="text-xs text-foreground/60">{tier.label}</p>
        </div>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors duration-150 hover:bg-accent/25"
      >
        Share
      </a>
    </div>
  );
}
