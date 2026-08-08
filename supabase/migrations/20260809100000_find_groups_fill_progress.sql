-- Find Groups was a flat, unordered list with no fill progress and no
-- trust signal before someone puts a deposit into a group of strangers.
-- Adds member_count (for a progress indicator) and the anchor admin's
-- name, and sorts closest-to-filling first so nearly-full groups surface
-- ahead of ones that just opened — matching purpose. Return type changed
-- (setof groups -> a named table), which CREATE OR REPLACE can't do, so
-- the old function is dropped first.

drop function if exists public.find_groups();

create function public.find_groups()
returns table (
  id uuid,
  name text,
  group_type public.group_type,
  contribution_amount numeric,
  frequency text,
  target_size int,
  member_count bigint,
  admin_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id, g.name, g.group_type, g.contribution_amount, g.frequency, g.target_size,
    (select count(*) from public.group_members gm where gm.group_id = g.id) as member_count,
    (
      select p.full_name
      from public.group_members gm2
      join public.profiles p on p.id = gm2.user_id
      where gm2.group_id = g.id and gm2.role = 'admin'
      order by gm2.user_id
      limit 1
    ) as admin_name
  from public.groups g
  where g.is_matching_group and g.status = 'forming'
    and (select count(*) from public.group_members gm where gm.group_id = g.id) < g.target_size
  order by
    (select count(*) from public.group_members gm where gm.group_id = g.id)::float / g.target_size desc;
$$;
