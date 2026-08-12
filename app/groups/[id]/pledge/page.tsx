import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PledgeCard } from "@/components/PledgeCard";

export default async function PledgePage({
  params,
}: PageProps<"/groups/[id]/pledge">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, group_type, contribution_amount")
    .eq("id", id)
    .single();

  if (!group || group.group_type !== "event") notFound();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/groups/${id}/pledge`)}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <PledgeCard group={group} />
    </main>
  );
}
