import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { CreateGroupFlow } from "@/components/CreateGroupFlow";

export default async function NewGroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <CreateGroupFlow />
    </main>
  );
}
