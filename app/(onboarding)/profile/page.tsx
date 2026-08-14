import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";

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
    .select("full_name, phone, avatar_url")
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
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <ProfileForm
        userId={user.id}
        defaultFullName={suggestedName}
        defaultPhone={profile?.phone ?? (user.phone ? `+${user.phone}` : "")}
        defaultAvatarUrl={profile?.avatar_url ?? null}
        redirectTo={redirectTo || "/"}
      />
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
