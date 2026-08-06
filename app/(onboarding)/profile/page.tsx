import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <ProfileForm
        defaultFullName={profile?.full_name ?? ""}
        defaultPhone={profile?.phone ?? (user.phone ? `+${user.phone}` : "")}
      />
    </main>
  );
}
