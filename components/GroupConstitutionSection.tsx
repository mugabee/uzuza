import { AcknowledgeButton } from "@/components/AcknowledgeButton";
import { Card } from "@/components/Card";

const APPROVAL_THRESHOLD_LABELS: Record<string, string> = {
  "1": "any one admin",
  "2-of-3": "at least two admins",
  all: "every admin",
};

type MemberStatus = {
  userId: string;
  name: string;
  acknowledgedAt: string | null;
};

export function GroupConstitutionSection({
  groupId,
  groupName,
  contributionAmount,
  frequency,
  rotationMethod,
  approvalThreshold,
  membersWithStatus,
  hasAcknowledged,
}: {
  groupId: string;
  groupName: string;
  contributionAmount: number;
  frequency: string;
  rotationMethod: string;
  approvalThreshold: string;
  membersWithStatus: MemberStatus[];
  hasAcknowledged: boolean;
}) {
  return (
    <Card className={hasAcknowledged ? "" : "ring-1 ring-accent/40"}>
      <h2 className="font-display text-lg font-semibold text-primary">
        Group rules
      </h2>
      <p className="mt-1 text-sm text-foreground/60">
        A plain-language summary of how {groupName} operates, generated from
        the settings below — the safety fund and account type controls
        further down are what actually set some of these rules.
      </p>

      <div className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-foreground/80">
        <div>
          <h3 className="font-semibold text-foreground">Contributions</h3>
          <p>
            Each member contributes {Number(contributionAmount).toLocaleString()}{" "}
            RWF every {frequency === "monthly" ? "month" : "week"}.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">Payout order</h3>
          <p>
            {rotationMethod === "random"
              ? "Decided by random draw at the start of each cycle."
              : "A fixed order agreed by the group."}
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">
            Payment confirmation
          </h3>
          <p>
            A contribution is only marked Paid once an admin verifies the MoMo
            transaction ID and a screenshot of the payment — a reference
            number alone is not sufficient.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">Payout approval</h3>
          <p>
            Sending the pooled contribution to that cycle's recipient requires
            approval from{" "}
            {APPROVAL_THRESHOLD_LABELS[approvalThreshold] ?? approvalThreshold},
            plus proof of transfer before it can be marked Completed. No
            single admin can send funds alone.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">Missed payments</h3>
          <p>
            A missed payment gets a fine, set by an admin at the time it's
            reported. If the member has already received their payout and the
            group's safety fund can cover it, the fine is drawn from that fund
            instead of chasing the member directly.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">Pausing or leaving</h3>
          <p>
            A member facing temporary hardship can request to skip one round
            rather than leave outright. Leaving goes through an admin decision
            and produces a plain agreement both sides can see.
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-black/10 pt-4">
        <h3 className="font-semibold text-foreground">Acknowledgment</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {membersWithStatus.map((m) => (
            <li key={m.userId} className="flex items-center justify-between">
              <span>{m.name}</span>
              <span
                className={
                  m.acknowledgedAt
                    ? "text-xs font-medium text-primary"
                    : "text-xs text-foreground/40"
                }
              >
                {m.acknowledgedAt ? "Acknowledged" : "Not yet"}
              </span>
            </li>
          ))}
        </ul>
        {!hasAcknowledged && <AcknowledgeButton groupId={groupId} />}
      </div>
    </Card>
  );
}
