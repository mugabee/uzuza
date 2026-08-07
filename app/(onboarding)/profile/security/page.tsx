import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaEnrollment } from "@/components/MfaEnrollment";

export default async function ProfileSecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Account Security
        </h1>
        <MfaEnrollment />
      </div>
    </main>
  );
}
