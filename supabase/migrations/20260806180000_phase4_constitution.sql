-- Phase 4 — Group Constitution acknowledgment. The document itself is
-- rendered dynamically from live group settings (see the constitution
-- page), not stored here — this table only tracks who has signed off.

create table public.constitution_acknowledgments (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.constitution_acknowledgments enable row level security;

create policy "select acknowledgments in your groups" on public.constitution_acknowledgments
  for select using (public.is_group_member(group_id));

create function public.acknowledge_constitution(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can acknowledge the constitution';
  end if;

  insert into public.constitution_acknowledgments (group_id, user_id)
  values (p_group_id, auth.uid())
  on conflict (group_id, user_id) do nothing;
end;
$$;
