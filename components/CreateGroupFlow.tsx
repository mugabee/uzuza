"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGroupSchema, type CreateGroupInput } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

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
              className="rounded-xl border border-black/10 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateGroupInput>({
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
      p_frequency: values.frequency,
      p_target_size: values.targetSize,
      p_account_type: values.accountType,
      p_rotation_method: values.rotationMethod,
      p_approval_threshold: values.approvalThreshold,
    });

    if (error) {
      setSubmitError(error.message);
      return;
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
          label="Contribution amount (RWF)"
          type="number"
          placeholder="25000"
          error={errors.contributionAmount?.message}
          {...register("contributionAmount")}
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Frequency</span>
          <select
            className="rounded-lg border border-black/10 px-4 py-2.5 outline-none focus:border-primary"
            {...register("frequency")}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <Field
          label="Target group size"
          type="number"
          placeholder="10"
          error={errors.targetSize?.message}
          {...register("targetSize")}
        />
        {submitError && <p className="text-xs text-red-500">{submitError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create group"}
        </Button>
      </form>
    </Card>
  );
}
