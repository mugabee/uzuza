"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { profileSchema, type ProfileInput } from "@/lib/validation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Card } from "@/components/Card";
import { useToast } from "@/lib/toast";
import { friendlyError } from "@/lib/friendly-error";

export function ProfileForm({
  userId,
  defaultFullName,
  defaultPhone,
  defaultAvatarUrl,
}: {
  userId: string;
  defaultFullName: string;
  defaultPhone: string;
  defaultAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(defaultAvatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const showToast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: defaultFullName, phone: defaultPhone },
  });

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setSubmitError(null);
    const supabase = createClient();
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingAvatar(false);
      setSubmitError(friendlyError(uploadError.message));
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust so switching photos shows up immediately.
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;
    await supabase
      .from("profiles")
      .update({ avatar_url: bustedUrl })
      .eq("id", userId);
    setAvatarUrl(bustedUrl);
    setUploadingAvatar(false);
    showToast("Photo updated");
  }

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
      setSubmitError(friendlyError(error.message));
      return;
    }

    showToast("Profile saved");
    router.push("/");
    router.refresh();
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

      <div className="mt-4 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl || "/default-avatar.svg"}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-full object-cover"
        />
        <label className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          {uploadingAvatar ? "Uploading..." : "Add a photo"}
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            disabled={uploadingAvatar}
            className="hidden"
          />
        </label>
      </div>

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
          <p role="alert" className="text-xs text-red-500">{submitError}</p>
        )}
        <Button type="submit" disabled={isSubmitting}
            loading={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </form>

      <Link
        href="/profile/security"
        className="mt-4 block text-center text-xs text-foreground/50 hover:text-primary"
      >
        Account security
      </Link>
    </Card>
  );
}
