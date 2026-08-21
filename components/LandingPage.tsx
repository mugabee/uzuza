import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StatusTicks } from "@/components/StatusTicks";

// The public, logged-out "/" (design brief §5A) — previously visitors
// only ever saw the login card, with no explanation of ibimina or why
// the shared-ledger model is trustworthy before being asked to sign in.
// Server component: no interactivity needed here beyond plain links, so
// no "use client" and no extra JS shipped for a page whose whole job is
// to load fast on a slow connection.
export function LandingPage() {
  return (
    <div className="flex w-full flex-col items-center">
      {/* ---- 1. Header ---- */}
      <header className="flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo size={26} />
        <nav className="flex items-center gap-6 text-sm font-medium">
          <a href="#how-it-works" className="hidden text-foreground/70 hover:text-primary sm:inline">
            How it works
          </a>
          <Link href="/login" className="text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        </nav>
      </header>

      {/* ---- 2. Hero ---- */}
      <section className="flex w-full max-w-5xl flex-col items-center gap-8 px-6 py-10 text-center sm:py-16">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-5xl">
            Twuzuzanya.
            <br />
            We complete each other.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-foreground/70 sm:text-lg">
            Uzuza replaces the notebook your ibimina already trusts with a shared ledger every
            member can see for themselves — the same rotating savings, kept safer.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/signup" className="w-full">
            <Button className="w-full">Create a group</Button>
          </Link>
          <Link href="/login" className="w-full">
            <Button variant="secondary" className="w-full">
              Sign in
            </Button>
          </Link>
        </div>

        <HeroWheel />
      </section>

      {/* ---- 3. Problem -> solution ---- */}
      <section className="w-full max-w-5xl px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border border-border">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
              The old way
            </span>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/70">
              <li>A notebook one person keeps, that everyone else has to trust</li>
              <li>Payments tracked in a WhatsApp thread, easy to lose</li>
              <li>One admin holds and sends the whole pot alone</li>
            </ul>
          </Card>
          <Card className="border border-primary/20 bg-primary/[0.03]">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              With Uzuza
            </span>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/80">
              <li>A live ledger every member can check themselves, anytime</li>
              <li>A unique payment reference per member, per cycle</li>
              <li>No payout leaves without more than one admin approving it</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* ---- 4. How it works ---- */}
      <section id="how-it-works" className="w-full max-w-5xl px-6 py-10">
        <h2 className="text-center font-display text-2xl font-semibold text-primary">
          How it works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Create or join a group",
              body:
                "Start your own ibimina with a contribution amount and schedule, or find one with matching if you don't have one yet.",
            },
            {
              title: "Pay your turn via MoMo",
              body:
                "Every cycle you get a unique reference. Send it with your MoMo payment, then submit your transaction ID and a screenshot as proof.",
            },
            {
              title: "The pot rotates, on record",
              body:
                "Admins confirm proof, then more than one of them signs off before the payout moves — visible to the whole group the entire time.",
            },
          ].map((step, i) => (
            <Card key={step.title}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1 text-sm text-foreground/60">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- 5. Trust ---- */}
      <section className="w-full max-w-5xl px-6 py-10">
        <Card className="border border-border">
          <h2 className="font-display text-xl font-semibold text-primary">Built on trust, not promises</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Dual proof", "A screenshot alone can be edited — every payment also needs the real MoMo transaction ID."],
              ["Multi-admin payouts", "One admin, two of three, or every admin must approve — set by the group, never one person alone."],
              ["A live ledger", "Every member sees the same balance and status. Nobody has to take the treasurer's word for it."],
              ["First-cycle safety fund", "New groups start with everyone contributing a full cycle before anyone is paid — real protection against someone leaving early."],
            ].map(([title, body]) => (
              <div key={title}>
                <dt className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <StatusTicks status="confirmed" />
                  {title}
                </dt>
                <dd className="mt-1 text-sm text-foreground/60">{body}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      {/* ---- 6. Features ---- */}
      <section className="w-full max-w-5xl px-6 py-10">
        <h2 className="text-center font-display text-2xl font-semibold text-primary">
          Everything your group already does, kept safer
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Rotating savings", "Fixed contributions, a shared ledger, and a payout that rotates fairly between members."],
            ["Event pledges", "One-time collections for a wedding, funeral, or school fees — with a goal, a shareable link, and a QR code."],
            ["Matching", "No group yet? Bring a couple of people you know, and fill the rest through matching with real accountability."],
            ["A personal wallet", "Top up or withdraw via MTN MoMo, and send or request money directly from another Uzuza member."],
            ["Send money from abroad", "Family abroad can contribute in their own currency — the group's books stay RWF-native either way."],
            ["Kinyarwanda & Luganda", "Core screens work in English, Kinyarwanda, and Luganda, not just English."],
          ].map(([title, body]) => (
            <Card key={title}>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-foreground/60">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="w-full max-w-5xl px-6 py-10 text-center">
        <Card className="border border-primary/20 bg-primary/[0.04]">
          <h2 className="font-display text-2xl font-semibold text-primary">Ready to start?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground/70">
            Bring your group's savings onto a ledger everyone can see, or find one to join.
          </p>
          <div className="mx-auto mt-5 flex max-w-xs flex-col gap-3">
            <Link href="/signup">
              <Button className="w-full">Create a group</Button>
            </Link>
            <Link href="/login" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              Already have an account? Sign in
            </Link>
          </div>
        </Card>
      </section>

      {/* ---- 7. Footer ---- */}
      <footer className="w-full max-w-5xl border-t border-border px-6 py-8 text-center text-xs text-foreground/50">
        <Logo size={18} className="mx-auto justify-center" />
        <p className="mt-3">Twuzuzanya — we complete each other.</p>
        <p className="mt-1">
          <Link href="/privacy" className="underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}

// A restrained, illustrative version of the group dashboard's real
// SavingsWheel — decorative here (no real member data exists for a
// logged-out visitor), but deliberately the same ring-and-dots geometry
// so the metaphor is introduced before someone ever has a real group of
// their own to see it bound to.
function HeroWheel() {
  const dots = 6;
  const radius = 76;
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true" className="opacity-90">
      <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle
        cx="90"
        cy="90"
        r={radius}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * radius * 0.62} ${2 * Math.PI * radius}`}
        transform="rotate(-90 90 90)"
      />
      {Array.from({ length: dots }, (_, i) => {
        const angle = (i / dots) * 2 * Math.PI - Math.PI / 2;
        const x = 90 + radius * Math.cos(angle);
        const y = 90 + radius * Math.sin(angle);
        const isRecipient = i === 0;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={isRecipient ? 9 : 6}
            fill={isRecipient ? "var(--accent-sun)" : "var(--primary)"}
            opacity={isRecipient ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}
