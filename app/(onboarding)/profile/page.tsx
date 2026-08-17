import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";
import { ProfileCountryCurrency } from "@/components/ProfileCountryCurrency";
import { SignOutButton } from "@/components/SignOutButton";
import { Card } from "@/components/Card";

export default async function ProfilePage({
  searchParams,
}: PageProps<"/profile">) {
  const { redirect: redirectToParam } = await searchParams;
  const redirectTo = Array.isArray(redirectToParam) ? redirectToParam[0] : redirectToParam;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url, country_code")
    .eq("id", user.id)
    .single();

  // Nothing on file yet? Take a first guess from the email address so the
  // field isn't blank, the same pattern most sign-up forms use — the
  // member can always change it before continuing.
  const suggestedName =
    profile?.full_name ||
    (user.email ? nameFromEmail(user.email) : "") ||
    "";

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <ProfileForm
          userId={user.id}
          defaultFullName={suggestedName}
          defaultPhone={profile?.phone ?? (user.phone ? `+${user.phone}` : "")}
          defaultAvatarUrl={profile?.avatar_url ?? null}
          defaultCountryCode={profile?.country_code ?? null}
          redirectTo={redirectTo || "/"}
          showSecurityLink={false}
        />

        <ProfileCountryCurrency userId={user.id} initialCountryCode={profile?.country_code ?? null} />

        <Card>
          <Link
            href="/profile/security"
            className="flex items-center justify-between gap-2 rounded-xl px-1 py-1 text-sm font-medium text-foreground transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Security & display
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-foreground/30">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="mt-1 px-1 text-xs text-foreground/50">
            MFA, passkeys, identity verification, text size, and language.
          </p>
        </Card>

        <SignOutButton />
      </div>
    </main>
  );
}

function nameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
