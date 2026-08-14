import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { friendlyError } from "../../lib/friendly-error";
import { FindGroupsClient } from "@/components/FindGroupsClient";

type FindGroupResult = {
  id: string;
  name: string;
  group_type: "rotating" | "event";
  contribution_amount: number;
  frequency: string;
  target_size: number;
  member_count: number;
  admin_name: string | null;
};

export default async function FindGroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: groups, error } = await supabase.rpc("find_groups") as {
    data: FindGroupResult[] | null;
    error: { message: string } | null;
  };

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Find a group
        </h1>
        <p className="text-sm text-foreground/60">
          Groups closest to filling are shown first.
        </p>

        {error && <p role="alert" className="text-sm text-danger">{friendlyError(error.message)}</p>}

        <FindGroupsClient groups={groups ?? []} />
      </div>
    </main>
  );
}
