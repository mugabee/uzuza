-- Real bug surfaced while building the lifetime savings journey view: a
-- cycle containing a 'missed' contribution could never reach 'completed',
-- because the completion check required every contribution to be
-- 'confirmed' specifically, with no path back from 'missed'. That froze
-- the group twice over — request_payout requires the cycle to already be
-- 'completed', and start_cycle refuses to start a new one while an
-- 'active' cycle still exists, so a single missed payment permanently
-- blocked both the current payout and every future cycle.
--
-- report_missed_payment is only ever called by an admin making a
-- deliberate call that a payment is genuinely missed (see Section 3.7's
-- escalation sequence) — by the time that status is set, the group has
-- already decided to move forward without it, with the fine and any
-- safety-fund draw already handled at the point it was reported. So
-- 'missed' is treated as resolved for completion purposes here, the same
-- way 'confirmed' already is. request_payout already only sums
-- 'confirmed' contributions, so a missed payment correctly reduces the
-- payout total rather than being silently included.

create or replace function public.confirm_contribution(p_contribution_id uuid, p_approve boolean, p_reason text default null)
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
  member_contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  select group_id, cycle_id, amount into target_group_id, target_cycle_id, member_contribution_amount
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
    perform public.require_fund_release_mfa();

    select coalesce(sum(amount), 0) into currently_held
    from public.custody_ledger where swept_at is null;
    select custody_cap_amount into cap from public.platform_settings where id = 1;

    if currently_held + member_contribution_amount > cap then
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
    values (target_group_id, p_contribution_id, member_contribution_amount);

    perform public.log_audit_event('contribution_confirmed_custody', 'contribution', p_contribution_id, jsonb_build_object('amount', member_contribution_amount, 'group_id', target_group_id));
  end if;

  if p_approve and g_safety_fund_type = 'buffer' then
    update public.groups
    set safety_fund_balance = safety_fund_balance + (g_base_amount * 0.075)
    where id = target_group_id;
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;
end;
$$;

-- report_missed_payment can itself be the last outstanding contribution in
-- a cycle (an admin reports a missed payment after everyone else already
-- confirmed), so it needs the same completion check confirm_contribution
-- runs — not just at whatever point the cycle happened to be checked last.
create or replace function public.report_missed_payment(p_contribution_id uuid, p_fine_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  is_admin boolean;
  recipient_paid boolean;
  fund_type public.safety_fund_type;
  fund_balance numeric;
  remaining_unconfirmed int;
begin
  select group_id, cycle_id, member_id
  into target_group_id, target_cycle_id, target_member_id
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can report a missed payment';
  end if;

  update public.contributions
  set status = 'missed', missed_fine_amount = p_fine_amount
  where id = p_contribution_id and status in ('pending', 'submitted');

  if not found then
    raise exception 'Contribution not found or already resolved';
  end if;

  select exists (
    select 1 from public.cycles c
    join public.payout_requests pr on pr.cycle_id = c.id
    where c.group_id = target_group_id
      and pr.recipient_user_id = target_member_id
      and pr.status = 'completed'
  ) into recipient_paid;

  if recipient_paid then
    select safety_fund_type, safety_fund_balance into fund_type, fund_balance
    from public.groups where id = target_group_id;

    if fund_type != 'off' and fund_balance >= p_fine_amount then
      update public.groups
      set safety_fund_balance = safety_fund_balance - p_fine_amount
      where id = target_group_id;
    end if;
    -- If the fund can't cover it, the contribution stays 'missed' with no
    -- further automatic action — Section 3.7 calls for an explicit group
    -- decision at that point, not a silent write.
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;

  perform public.log_audit_event('missed_payment_reported', 'contribution', p_contribution_id, jsonb_build_object('fine_amount', p_fine_amount, 'recipient_paid', recipient_paid));
end;
$$;

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
  from public.contributions where cycle_id = new_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now() where id = new_cycle_id;
  end if;

  return new_cycle_id;
end;
$$;
