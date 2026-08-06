-- Two real bugs, both caught by the Phase 8 e2e check (starting a second
-- cycle is the first time any test exercised this path):
--
-- 1. "matching_reservation := null" on a generic `record` variable does
--    not give it a structure — checking matching_reservation.id later
--    throws "tuple structure of a not-yet-assigned record is
--    indeterminate" for any cycle after the first (where the `if
--    next_cycle_number = 1` guard means the SELECT INTO that would have
--    assigned it never runs). Fixed by using plain nullable scalar
--    variables instead of a record — scalars are safely NULL until
--    assigned, records are not.
--
-- 2. The member loop and recipient draw never filtered by
--    membership_status, introduced in Phase 8 — a paused/exited/removed
--    member could still be drawn as a cycle's recipient or be charged a
--    fresh contribution for a cycle after they've left.
create or replace function public.start_cycle(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  next_cycle_number int;
  new_cycle_id uuid;
  chosen_recipient uuid;
  group_amount numeric;
  fund_type public.safety_fund_type;
  member_row record;
  reservation_id_val uuid;
  reservation_txn text;
  reservation_screenshot text;
  remaining_unconfirmed int;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can start a cycle';
  end if;

  if exists (
    select 1 from public.cycles where group_id = p_group_id and status = 'active'
  ) then
    raise exception 'This group already has an active cycle';
  end if;

  select coalesce(max(cycle_number), 0) + 1 into next_cycle_number
  from public.cycles where group_id = p_group_id;

  select user_id into chosen_recipient
  from public.group_members
  where group_id = p_group_id and membership_status = 'active'
  order by random()
  limit 1;

  if chosen_recipient is null then
    raise exception 'Group has no active members yet';
  end if;

  select contribution_amount, safety_fund_type into group_amount, fund_type
  from public.groups where id = p_group_id;

  if fund_type = 'buffer' then
    group_amount := group_amount * 1.075;
  end if;

  insert into public.cycles (group_id, cycle_number, recipient_user_id)
  values (p_group_id, next_cycle_number, chosen_recipient)
  returning id into new_cycle_id;

  for member_row in
    select user_id from public.group_members
    where group_id = p_group_id and membership_status = 'active'
  loop
    reservation_id_val := null;
    reservation_txn := null;
    reservation_screenshot := null;

    if next_cycle_number = 1 then
      select id, transaction_id, screenshot_path
      into reservation_id_val, reservation_txn, reservation_screenshot
      from public.reservations
      where group_id = p_group_id and user_id = member_row.user_id and status = 'confirmed';
    end if;

    if reservation_id_val is not null then
      insert into public.contributions (
        cycle_id, group_id, member_id, unique_reference, amount,
        status, transaction_id, screenshot_path, submitted_at, confirmed_at, reservation_id
      ) values (
        new_cycle_id, p_group_id, member_row.user_id,
        'UZ-' || substr(p_group_id::text, 1, 6) || '-' || next_cycle_number || '-' || substr(member_row.user_id::text, 1, 6),
        group_amount, 'confirmed', reservation_txn, reservation_screenshot,
        now(), now(), reservation_id_val
      );
    else
      insert into public.contributions (
        cycle_id, group_id, member_id, unique_reference, amount
      ) values (
        new_cycle_id, p_group_id, member_row.user_id,
        'UZ-' || substr(p_group_id::text, 1, 6) || '-' || next_cycle_number || '-' || substr(member_row.user_id::text, 1, 6),
        group_amount
      );
    end if;
  end loop;

  select count(*) into remaining_unconfirmed
  from public.contributions where cycle_id = new_cycle_id and status != 'confirmed';

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now() where id = new_cycle_id;
  end if;

  return new_cycle_id;
end;
$$;
