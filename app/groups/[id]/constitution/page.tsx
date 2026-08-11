import { redirect } from "next/navigation";

// The constitution is now merged directly into the group settings page
// (components/GroupConstitutionSection.tsx) rather than living on its own
// route - this stays only so old links/bookmarks don't 404.
export default async function ConstitutionPage({
  params,
}: PageProps<"/groups/[id]/constitution">) {
  const { id } = await params;
  redirect(`/groups/${id}/settings`);
}
