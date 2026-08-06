import Link from "next/link";
import { requireStaff } from "@/lib/staff-check";

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <nav className="flex gap-6 border-b border-black/10 bg-white px-8 py-4 text-sm">
        <span className="font-display font-semibold text-primary">
          Uzuza Internal
        </span>
        <Link href="/internal" className="text-foreground/70 hover:text-primary">
          Metrics
        </Link>
        <Link href="/internal/mediation" className="text-foreground/70 hover:text-primary">
          Mediation
        </Link>
        <Link
          href="/internal/unmatched-payments"
          className="text-foreground/70 hover:text-primary"
        >
          Unmatched Payments
        </Link>
        <Link href="/internal/custody" className="text-foreground/70 hover:text-primary">
          Custody
        </Link>
        <Link href="/internal/id-review" className="text-foreground/70 hover:text-primary">
          ID Review
        </Link>
      </nav>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
