"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { profileSchema, type ProfileInput } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";

export function ProfileForm({
  defaultFullName,
  defaultPhone,
}: {
  defaultFullName: string;
  defaultPhone: string;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: defaultFullName, phone: defaultPhone },
  });

  async function onSubmit(values: ProfileInput) {
    setSubmitError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: values.fullName, phone: values.phone })
      .eq("id", user.id);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.push("/groups/new");
  }

  return (
    <Card className="max-w-sm">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Tell us about you
      </h1>
      <p className="mt-1 text-sm text-foreground/70">
        Your phone number is used for MoMo matching, even if you signed in
        with email.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-4"
      >
        <Field
          label="Full name"
          placeholder="Jean Uwimana"
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <Field
          label="Phone number"
          type="tel"
          placeholder="+250788123456"
          error={errors.phone?.message}
          {...register("phone")}
        />
        {submitError && (
          <p className="text-xs text-red-500">{submitError}</p>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </Card>
  );
}
