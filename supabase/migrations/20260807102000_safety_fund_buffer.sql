-- Wires the actual behavior for safety_fund_type = 'buffer': a 7.5%
-- surcharge collected alongside every contribution, routed into
-- safety_fund_balance on confirmation. 'freeze' needs no extra code —
-- the existing rule that a cycle only completes (and a payout can only
-- be requested) once every contribution is confirmed already IS a full
-- first-cycle freeze, for every cycle, not just the first.
--
-- Both functions keep their exact existing signatures — CREATE OR REPLACE
-- only ever safely replaces when the signature matches exactly (see the
-- overload bug fixed in 20260806211500); adding a new param here would
-- repeat that mistake.

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
  matching_reservation record;
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
  where group_id = p_group_id
  order by random()
  limit 1;

  if chosen_recipient is null then
    raise exception 'Group has no members yet';
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
    select user_id from public.group_members where group_id = p_group_id
  loop
    matching_reservation := null;
    if next_cycle_number = 1 then
      select id, transaction_id, screenshot_path into matching_reservation
      from public.reservations
      where group_id = p_group_id and user_id = member_row.user_id and status = 'confirmed';
    end if;

    if matching_reservation.id is not null then
      insert into public.contributions (
        cycle_id, group_id, member_id, unique_reference, amount,
        status, transaction_id, screenshot_path, submitted_at, confirmed_at, reservation_id
      ) values (
        new_cycle_id, p_group_id, member_row.user_id,
        'UZ-' || substr(p_group_id::text, 1, 6) || '-' || next_cycle_number || '-' || substr(member_row.user_id::text, 1, 6),
        group_amount, 'confirmed', matching_reservation.transaction_id, matching_reservation.screenshot_path,
        now(), now(), matching_reservation.id
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

create or replace function public.confirm_contribution(
  p_contribution_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  is_admin boolean;
  remaining_unconfirmed int;
  g_account_type public.account_type;
  g_safety_fund_type public.safety_fund_type;
  g_base_amount numeric;
  contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  select group_id, cycle_id, amount into target_group_id, target_cycle_id, contribution_amount
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm contributions';
  end if;

  select account_type, safety_fund_type, contribution_amount
  into g_account_type, g_safety_fund_type, g_base_amount
  from public.groups where id = target_group_id;

  if p_approve and g_account_type = 'uzuza_held' then
    select coalesce(sum(amount), 0) into currently_held
    from public.custody_ledger where swept_at is null;
    select custody_cap_amount into cap from public.platform_settings where id = 1;

    if currently_held + contribution_amount > cap then
      raise exception 'Platform custody cap reached — cannot hold this contribution right now';
    end if;
  end if;

  if p_approve then
    update public.contributions
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'submitted';
  else
    update public.contributions
    set status = 'pending',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'submitted';
  end if;

  if not found then
    raise exception 'Contribution not found or not awaiting confirmation';
  end if;

  if p_approve and g_account_type = 'uzuza_held' then
    insert into public.custody_ledger (group_id, contribution_id, amount)
    values (target_group_id, p_contribution_id, contribution_amount);
  end if;

  if p_approve and g_safety_fund_type = 'buffer' then
    update public.groups
    set safety_fund_balance = safety_fund_balance + (g_base_amount * 0.075)
    where id = target_group_id;
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status != 'confirmed';

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;
end;
$$;
