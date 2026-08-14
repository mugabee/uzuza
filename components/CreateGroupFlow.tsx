"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import {
  createGroupSchema,
  type CreateGroupFormInput,
  type CreateGroupInput,
} from "../lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { friendlyError } from "../lib/friendly-error";

const GROUP_TEMPLATES = [
  {
    id: "market",
    label: "Market Group",
    description: "Weekly contributions, larger group — fits traders and cash-frequency savers.",
    values: {
      contributionAmount: 25000,
      frequency: "weekly" as const,
      targetSize: 12,
      approvalThreshold: "1" as const,
    },
    safetyFundType: "freeze" as const,
  },
  {
    id: "professional",
    label: "Professional Group",
    description: "Higher monthly contribution, smaller group — fits salaried members.",
    values: {
      contributionAmount: 100000,
      frequency: "monthly" as const,
      targetSize: 8,
      approvalThreshold: "1" as const,
    },
    safetyFundType: "freeze" as const,
  },
  {
    id: "church",
    label: "Church Group",
    description: "Moderate monthly contribution, larger group, more than one admin must approve.",
    values: {
      contributionAmount: 50000,
      frequency: "monthly" as const,
      targetSize: 15,
      approvalThreshold: "2-of-3" as const,
    },
    safetyFundType: "freeze" as const,
  },
];

const GROUP_TYPES = [
  {
    value: "rotating" as const,
    title: "Rotating Savings",
    description:
      "Ibimina — fixed equal contributions, recurring cycles, payout rotates between members.",
  },
  {
    value: "event" as const,
    title: "Event Contribution",
    description:
      "Variable pledges toward a one-time goal (wedding, funeral, project), paid out to organizers.",
  },
];

export function CreateGroupFlow() {
  const [groupType, setGroupType] = useState<"rotating" | "event" | null>(
    null,
  );

  if (!groupType) {
    return (
      <Card className="max-w-md">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Choose your path
        </h1>
        <p className="mt-1 text-sm text-foreground/70">
          What kind of group are you creating?
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {GROUP_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setGroupType(t.value)}
              className="rounded-xl border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="font-semibold text-foreground">{t.title}</div>
              <div className="mt-1 text-sm text-foreground/60">
                {t.description}
              </div>
            </button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <GroupDetailsForm
      groupType={groupType}
      onBack={() => setGroupType(null)}
    />
  );
}

function GroupDetailsForm({
  groupType,
  onBack,
}: {
  groupType: "rotating" | "event";
  onBack: () => void;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isMatchingGroup, setIsMatchingGroup] = useState(false);
  // Full first-cycle freeze as the default — Section 3.7's own guidance:
  // everyone contributes a full cycle before anyone is paid, the strongest
  // protection against the highest-risk case (a member leaving after
  // receiving the pot). Off/buffer stay available for groups that want less
  // friction, but the safer choice is what a new group starts with.
  const [safetyFundType, setSafetyFundType] = useState<"off" | "buffer" | "freeze">("freeze");
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateGroupFormInput, unknown, CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      groupType,
      frequency: "monthly",
      accountType: "group_owned",
      rotationMethod: "random",
      approvalThreshold: "1",
    },
  });

  async function onSubmit(values: CreateGroupInput) {
    setSubmitError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_group", {
      p_name: values.name,
      p_group_type: values.groupType,
      p_contribution_amount: values.contributionAmount,
      // Frequency/rotation aren't meaningful for a one-time event
      // collection — submit harmless defaults for the NOT NULL columns
      // rather than showing irrelevant fields.
      p_frequency: groupType === "event" ? "monthly" : values.frequency,
      p_target_size: values.targetSize,
      p_account_type: values.accountType,
      p_rotation_method: groupType === "event" ? "random" : values.rotationMethod,
      p_approval_threshold: values.approvalThreshold,
      p_is_matching_group: isMatchingGroup,
      p_pledge_goal: groupType === "event" ? values.pledgeGoal : undefined,
    });

    if (error) {
      setSubmitError(friendlyError(error.message));
      return;
    }

    if (groupType === "rotating" && safetyFundType !== "off") {
      await supabase.rpc("set_safety_fund_type", {
        p_group_id: data,
        p_safety_fund_type: safetyFundType,
      });
    }

    router.push(`/groups/${data}`);
  }

  return (
    <Card className="max-w-sm">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        ← Change group type
      </button>
      <h1 className="mt-3 font-display text-2xl font-semibold text-primary">
        {groupType === "rotating" ? "Rotating Savings" : "Event Contribution"}
      </h1>

      {groupType === "rotating" && (
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Start from a template (optional)
          </span>
          {GROUP_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                reset({ ...getValues(), ...t.values });
                setSafetyFundType(t.safetyFundType);
                setAppliedTemplate(t.id);
              }}
              className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                appliedTemplate === t.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary"
              }`}
            >
              <div className="font-semibold text-foreground">{t.label}</div>
              <div className="mt-0.5 text-xs text-foreground/60">{t.description}</div>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-4"
      >
        <Field
          label="Group name"
          placeholder="Market Group"
          error={errors.name?.message}
          {...register("name")}
        />
        <Field
          label={
            groupType === "event"
              ? "Suggested pledge amount (RWF)"
              : "Contribution amount (RWF)"
          }
          type="number"
          placeholder="25000"
          error={errors.contributionAmount?.message}
          {...register("contributionAmount")}
        />
        {groupType === "event" ? (
          <Field
            label="Fundraising goal (optional)"
            type="number"
            placeholder="500000"
            error={errors.pledgeGoal?.message}
            {...register("pledgeGoal")}
          />
        ) : (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Frequency</span>
            <select
              className="rounded-lg border border-border px-4 py-2.5 outline-none focus:border-primary"
              {...register("frequency")}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        )}
        <Field
          label={groupType === "event" ? "Expected contributors" : "Target group size"}
          type="number"
          placeholder="10"
          error={errors.targetSize?.message}
          {...register("targetSize")}
        />
        {groupType === "rotating" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Safety fund</span>
            <select
              className="rounded-lg border border-border px-4 py-2.5 outline-none focus:border-primary"
              value={safetyFundType}
              onChange={(e) => setSafetyFundType(e.target.value as typeof safetyFundType)}
            >
              <option value="off">Off</option>
              <option value="buffer">
                Rolling buffer (7.5% surcharge each round)
              </option>
              <option value="freeze">Full first-cycle freeze</option>
            </select>
          </label>
        )}
        {groupType === "rotating" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={isMatchingGroup}
              onChange={(e) => setIsMatchingGroup(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-foreground">
                Open this group to strangers (matching)
              </span>
              <span className="block text-xs text-foreground/60">
                Other users can find and reserve a spot with a refundable
                deposit, held by Uzuza until the group fills. Leave unchecked
                to only let people you invite by link join.
              </span>
            </span>
          </label>
        )}
        {submitError && <p role="alert" className="text-xs text-danger">{submitError}</p>}
        <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create group"}
        </Button>
      </form>
    </Card>
  );
}
