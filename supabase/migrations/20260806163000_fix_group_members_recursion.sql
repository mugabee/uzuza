-- The "members of your groups" policy on group_members subqueried
-- group_members from within its own policy, which Postgres correctly
-- rejects as infinite recursion (42P17). A SECURITY DEFINER helper breaks
-- the cycle: it runs as the table owner, so its internal query isn't
-- subject to the calling policy re-evaluating itself.
create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

drop policy "select members of your groups" on public.group_members;

create policy "select members of your groups" on public.group_members
  for select using (public.is_group_member(group_id));
