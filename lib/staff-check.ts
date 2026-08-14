import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) redirect("/");

  return { supabase, user };
}
