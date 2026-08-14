import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { ReserveCard } from "@/components/ReserveCard";

export default async function ReservePage({
  params,
}: PageProps<"/groups/[id]/reserve">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, group_type, contribution_amount, frequency, target_size, is_matching_group, status")
    .eq("id", id)
    .single();

  if (!group || !group.is_matching_group) notFound();

  const { data: existingMembership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) redirect(`/groups/${id}`);

  if (group.status !== "forming") {
    redirect(`/groups/${id}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <ReserveCard group={group} />
    </main>
  );
}
