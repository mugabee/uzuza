-- Two fixes caught while building the custody monitor page, before it
-- ever shipped: (1) platform_settings never had RLS enabled at all since
-- Phase 7 — readable by anyone, not locked to staff; (2) custody_ledger
-- IS locked down (Phase 5's is_group_member policy), which means a
-- direct table read from the internal console would only ever show
-- custody entries for groups the staff member happens to personally
-- belong to — wrong for a platform-wide monitor. Same "controlled read
-- function" pattern as the rest of Phase 9 instead of a direct read.

alter table public.platform_settings enable row level security;
create policy "staff can see platform settings" on public.platform_settings
  for select using (public.is_staff());

create function public.get_custody_overview()
returns table (
  held_total numeric,
  custody_cap numeric,
  recent_sweeps jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select
    (select coalesce(sum(amount), 0) from public.custody_ledger where swept_at is null),
    (select custody_cap_amount from public.platform_settings where id = 1),
    (
      select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) from (
        select amount, swept_at
        from public.custody_ledger
        where swept_at is not null
        order by swept_at desc
        limit 10
      ) s
    );
end;
$$;
