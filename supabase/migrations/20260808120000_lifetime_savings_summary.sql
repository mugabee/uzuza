-- Section 3.8: "personal lifetime savings journey view" and
-- "streak/consistency badges". A single aggregate function rather than
-- several client-side joins across groups/cycles/contributions — same
-- reasoning as every other cross-cutting read in this app
-- (get_platform_metrics, get_pledge_board, etc).

create function public.get_lifetime_savings_summary()
returns table (
  total_saved numeric,
  cycles_completed int,
  missed_count int,
  current_streak int,
  groups_count int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  streak int := 0;
  rec record;
begin
  select coalesce(sum(amount), 0) into total_saved
  from public.contributions
  where member_id = auth.uid() and status = 'confirmed';

  select count(distinct c.cycle_id) into cycles_completed
  from public.contributions c
  join public.cycles cy on cy.id = c.cycle_id
  where c.member_id = auth.uid() and c.status = 'confirmed' and cy.status = 'completed';

  select count(*) into missed_count
  from public.contributions
  where member_id = auth.uid() and status = 'missed';

  select count(distinct group_id) into groups_count
  from public.group_members
  where user_id = auth.uid() and membership_status = 'active';

  for rec in
    select c.status
    from public.contributions c
    join public.cycles cy on cy.id = c.cycle_id
    where c.member_id = auth.uid() and cy.status = 'completed'
    order by cy.completed_at desc
  loop
    exit when rec.status = 'missed';
    streak := streak + 1;
  end loop;
  current_streak := streak;

  return next;
end;
$$;
