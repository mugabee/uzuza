import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaEnrollment } from "@/components/MfaEnrollment";
import { DisplaySettings } from "@/components/DisplaySettings";
import { ReferralCard } from "@/components/ReferralCard";
import { OtherSettings } from "@/components/OtherSettings";
import { Card } from "@/components/Card";

export default async function ProfileSecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Settings
        </h1>

        <Link href="/profile">
          <Card className="flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft-md)]">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {(profile?.full_name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">
                {profile?.full_name ?? "Add your name"}
              </p>
              <p className="truncate text-sm text-foreground/60">
                {profile?.phone ?? user.email ?? "No contact info yet"}
              </p>
            </div>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-foreground/30"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Card>
        </Link>

        <ReferralCard />
        <MfaEnrollment />
        <DisplaySettings />
        <OtherSettings />
      </div>
    </main>
  );
}
