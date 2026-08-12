import Link from "next/link";
import { Card } from "@/components/Card";

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Privacy Policy
        </h1>
        <Card className="flex flex-col gap-4 text-sm leading-relaxed text-foreground/80">
          <p>
            Uzuza collects the phone number and name you provide, contribution
            and payout records for the groups you join, and — only if you
            explicitly opt into an Uzuza-held account — proof-of-transfer
            screenshots and transaction IDs, kept in a private storage bucket
            not accessible to other members.
          </p>
          <p>
            Your data is used to run your groups' shared ledger, match payment
            references, calculate approval thresholds, and — for matched
            groups — show a reputation summary to prospective groupmates.
            We don't sell your data, and we don't share it outside the app
            except where mediation or a legal obligation requires it.
          </p>
          <p>
            You can request account deletion at any time by contacting
            support. Financial and approval records tied to a group you were
            part of may be retained for the group's audit trail even after
            your account is removed, consistent with the transparency every
            member of that group relies on.
          </p>
          <p className="text-xs text-foreground/40">
            This is a plain-language summary, not a final legal document —
            Uzuza's full custody and data-handling policy is still under
            legal review.
          </p>
        </Card>
        <Link href="/profile/security" className="text-center text-sm text-foreground/50 hover:text-primary">
          Back to settings
        </Link>
      </div>
    </main>
  );
}
