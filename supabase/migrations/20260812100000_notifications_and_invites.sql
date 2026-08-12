-- In-app notification center (Save app reference: bell icon, All/Unread tabs,
-- "Mark all as read") plus a lightweight invite-code referral system (Save's
-- version pays a monetary commission per referral; Uzuza has no commission
-- model defined anywhere in CLAUDE.md, so this only tracks who referred whom
-- for Section 3.4's weak-tie-invite matching model — no money changes hands).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- No insert/delete policy for clients — every row is written by a
-- security-definer function on the writer's behalf (same pattern as
-- audit_log), never directly by a client.

create function public.create_notification(
  p_user_id uuid, p_title text, p_body text, p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  values (p_user_id, p_title, p_body, p_link);
end;
$$;

create function public.list_notifications(p_unread_only boolean default false)
returns setof public.notifications
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.notifications
  where user_id = auth.uid()
    and (not p_unread_only or read_at is null)
  order by created_at desc
  limit 100;
$$;

create function public.get_unread_notification_count()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.notifications
  where user_id = auth.uid() and read_at is null;
$$;

create function public.mark_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where id = p_id and user_id = auth.uid() and read_at is null;
$$;

create function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------
-- Wire notifications into the existing high-stakes RPCs. Every function
-- below is CREATE OR REPLACE with the exact same signature it already
-- has live (fetched via pg_get_functiondef immediately before writing
-- this migration) plus one or two added notification calls — no other
-- line changed, so there's no risk of silently altering business logic
-- while bolting this on.
-- ---------------------------------------------------------------------

create or replace function public.confirm_contribution(p_contribution_id uuid, p_approve boolean, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  target_group_name text;
  is_admin boolean;
  remaining_unconfirmed int;
  g_account_type public.account_type;
  g_safety_fund_type public.safety_fund_type;
  g_base_amount numeric;
  member_contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  select group_id, cycle_id, amount, member_id
  into target_group_id, target_cycle_id, member_contribution_amount, target_member_id
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

  select account_type, safety_fund_type, contribution_amount, name
  into g_account_type, g_safety_fund_type, g_base_amount, target_group_name
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

  if p_approve then
    perform public.create_notification(
      target_member_id, 'Payment confirmed',
      'Your ' || member_contribution_amount::text || ' RWF contribution to ' || target_group_name || ' was confirmed.',
      '/groups/' || target_group_id
    );
  else
    perform public.create_notification(
      target_member_id, 'Payment needs another try',
      'Your proof for ' || target_group_name || ' was not accepted' || coalesce(': ' || p_reason, '.') || ' Please resubmit.',
      '/groups/' || target_group_id
    );
  end if;
end;
$function$;

create or replace function public.report_missed_payment(p_contribution_id uuid, p_fine_amount numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  target_group_name text;
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

  select name into target_group_name from public.groups where id = target_group_id;
  perform public.create_notification(
    target_member_id, 'Missed payment reported',
    'A ' || p_fine_amount::text || ' RWF fine was added in ' || target_group_name || '. You can pay late to stay in good standing.',
    '/groups/' || target_group_id
  );
end;
$function$;

create or replace function public.request_payout(p_cycle_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_recipient uuid;
  target_status public.cycle_status;
  target_group_name text;
  total_amount numeric;
  is_admin boolean;
  new_request_id uuid;
  other_admin record;
begin
  perform public.check_rate_limit('request_payout', 60);

  select group_id, recipient_user_id, status
  into target_group_id, target_recipient, target_status
  from public.cycles where id = p_cycle_id;

  if target_group_id is null then
    raise exception 'Cycle not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can request a payout';
  end if;

  if target_status != 'completed' then
    raise exception 'Cycle is not completed yet';
  end if;

  select coalesce(sum(amount), 0) into total_amount
  from public.contributions
  where cycle_id = p_cycle_id and status = 'confirmed';

  insert into public.payout_requests (
    cycle_id, group_id, recipient_user_id, amount, requested_by
  ) values (
    p_cycle_id, target_group_id, target_recipient, total_amount, auth.uid()
  )
  returning id into new_request_id;

  perform public.log_audit_event('payout_requested', 'payout_request', new_request_id, jsonb_build_object('amount', total_amount, 'cycle_id', p_cycle_id));

  select name into target_group_name from public.groups where id = target_group_id;
  for other_admin in
    select user_id from public.group_members
    where group_id = target_group_id and role = 'admin' and user_id != auth.uid()
  loop
    perform public.create_notification(
      other_admin.user_id, 'Payout needs your approval',
      total_amount::text || ' RWF payout requested in ' || target_group_name || '.',
      '/groups/' || target_group_id
    );
  end loop;

  return new_request_id;
end;
$function$;

create or replace function public.approve_payout(p_payout_request_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_status public.payout_status;
  target_group_name text;
  target_recipient uuid;
  requested_by_id uuid;
  is_admin boolean;
  threshold text;
  admin_count int;
  required_approvals int;
  current_approvals int;
begin
  perform public.require_fund_release_mfa();

  select group_id, status into target_group_id, target_status
  from public.payout_requests where id = p_payout_request_id;

  if target_group_id is null then
    raise exception 'Payout request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can approve a payout';
  end if;

  if target_status != 'pending' then
    raise exception 'Payout request is not awaiting approval';
  end if;

  insert into public.payout_approvals (payout_request_id, approved_by)
  values (p_payout_request_id, auth.uid())
  on conflict (payout_request_id, approved_by) do nothing;

  select approval_threshold into threshold from public.groups where id = target_group_id;
  select count(*) into admin_count
  from public.group_members where group_id = target_group_id and role = 'admin';

  required_approvals := case threshold
    when '1' then 1
    when '2-of-3' then least(2, admin_count)
    when 'all' then admin_count
    else 1
  end;

  select count(*) into current_approvals
  from public.payout_approvals where payout_request_id = p_payout_request_id;

  perform public.log_audit_event('payout_approved', 'payout_request', p_payout_request_id, jsonb_build_object('current_approvals', current_approvals, 'required_approvals', required_approvals));

  if current_approvals >= required_approvals then
    update public.payout_requests set status = 'approved' where id = p_payout_request_id;

    select group_id, recipient_user_id, requested_by into target_group_id, target_recipient, requested_by_id
    from public.payout_requests where id = p_payout_request_id;
    select name into target_group_name from public.groups where id = target_group_id;

    perform public.create_notification(
      requested_by_id, 'Payout approved',
      'The payout you requested in ' || target_group_name || ' has all the approvals it needs — ready to send.',
      '/groups/' || target_group_id
    );
  end if;
end;
$function$;

create or replace function public.complete_payout(p_payout_request_id uuid, p_transaction_id text, p_screenshot_path text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_group_name text;
  target_recipient uuid;
  target_amount numeric;
  is_admin boolean;
begin
  perform public.require_fund_release_mfa();

  select group_id into target_group_id
  from public.payout_requests where id = p_payout_request_id;

  if target_group_id is null then
    raise exception 'Payout request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can complete a payout';
  end if;

  update public.payout_requests
  set status = 'completed',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      completed_by = auth.uid(),
      completed_at = now()
  where id = p_payout_request_id and status = 'approved';

  if not found then
    raise exception 'Payout request not found or not yet approved';
  end if;

  perform public.log_audit_event('payout_completed', 'payout_request', p_payout_request_id, jsonb_build_object('transaction_id', p_transaction_id));

  select recipient_user_id, amount, name into target_recipient, target_amount, target_group_name
  from public.payout_requests join public.groups on groups.id = payout_requests.group_id
  where payout_requests.id = p_payout_request_id;

  perform public.create_notification(
    target_recipient, 'Payout sent',
    'Your ' || target_amount::text || ' RWF payout from ' || target_group_name || ' has been sent.',
    '/groups/' || target_group_id
  );
end;
$function$;

create or replace function public.decide_exit(p_exit_request_id uuid, p_approve boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_user_id uuid;
  target_group_name text;
  is_admin boolean;
begin
  select group_id, user_id into target_group_id, target_user_id
  from public.exit_requests where id = p_exit_request_id;

  if target_group_id is null then
    raise exception 'Exit request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can decide an exit request';
  end if;

  update public.exit_requests
  set status = (case when p_approve then 'agreed' else 'cancelled' end)::public.exit_status,
      decided_by = auth.uid(), decided_at = now()
  where id = p_exit_request_id and status = 'pending';

  if not found then
    raise exception 'Exit request not found or already decided';
  end if;

  if p_approve then
    update public.group_members
    set membership_status = 'exited'
    where group_id = target_group_id and user_id = target_user_id;
  end if;

  perform public.log_audit_event('exit_decided', 'exit_request', p_exit_request_id, jsonb_build_object('approved', p_approve));

  select name into target_group_name from public.groups where id = target_group_id;
  perform public.create_notification(
    target_user_id,
    case when p_approve then 'Exit agreed' else 'Exit request declined' end,
    case when p_approve
      then 'Your exit from ' || target_group_name || ' has been agreed. See the Exit Agreement for details.'
      else 'Your request to leave ' || target_group_name || ' was declined by an admin.'
    end,
    '/groups/' || target_group_id
  );
end;
$function$;

create or replace function public.confirm_reservation(p_reservation_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_group_name text;
  target_user_id uuid;
  fee numeric;
  is_admin boolean;
begin
  select group_id, fee_amount, user_id into target_group_id, fee, target_user_id
  from public.reservations where id = p_reservation_id;

  if target_group_id is null then
    raise exception 'Reservation not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a reservation';
  end if;

  update public.reservations
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_reservation_id and status = 'submitted';

  if not found then
    raise exception 'Reservation not found or not awaiting confirmation';
  end if;

  insert into public.custody_ledger (group_id, reservation_id, amount)
  values (target_group_id, p_reservation_id, fee);

  select name into target_group_name from public.groups where id = target_group_id;
  perform public.create_notification(
    target_user_id, 'Spot reserved',
    'Your reservation for ' || target_group_name || ' is confirmed.',
    '/groups/' || target_group_id
  );

  perform public.try_activate_matching_group(target_group_id);
end;
$function$;

-- try_activate_matching_group notifies every member once the group flips
-- from forming to active, since that's the moment the whole point of
-- reserving a spot (the group actually starting) becomes real.
create or replace function public.try_activate_matching_group(p_group_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_size int;
  target_group_name text;
  total_members int;
  unconfirmed_prospectives int;
  unacknowledged_members int;
  member record;
begin
  select g.target_size, g.name into target_size, target_group_name
  from public.groups g
  where g.id = p_group_id and g.status = 'forming';

  if target_size is null then
    return;
  end if;

  select count(*) into total_members
  from public.group_members where group_id = p_group_id;

  select count(*) into unconfirmed_prospectives
  from public.group_members gm
  where gm.group_id = p_group_id and gm.role = 'prospective'
    and not exists (
      select 1 from public.reservations r
      where r.group_id = gm.group_id and r.user_id = gm.user_id and r.status = 'confirmed'
    );

  select count(*) into unacknowledged_members
  from public.group_members gm
  where gm.group_id = p_group_id
    and not exists (
      select 1 from public.constitution_acknowledgments ca
      where ca.group_id = gm.group_id and ca.user_id = gm.user_id
    );

  if total_members >= target_size
     and unconfirmed_prospectives = 0
     and unacknowledged_members = 0 then
    update public.groups set status = 'active' where id = p_group_id;
    update public.group_members set role = 'member'
    where group_id = p_group_id and role = 'prospective';

    for member in
      select user_id from public.group_members where group_id = p_group_id
    loop
      perform public.create_notification(
        member.user_id, 'Group activated',
        target_group_name || ' is full and now active — the first cycle can begin.',
        '/groups/' || p_group_id
      );
    end loop;
  end if;
end;
$function$;

create or replace function public.propose_group_change(p_group_id uuid, p_change_type proposal_change_type, p_payload jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  is_admin boolean;
  new_id uuid;
  target_group_name text;
  other_admin record;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can propose a change';
  end if;

  insert into public.group_change_proposals (group_id, proposed_by, change_type, payload)
  values (p_group_id, auth.uid(), p_change_type, p_payload)
  returning id into new_id;

  perform public.log_audit_event('group_change_proposed', 'group_change_proposal', new_id, jsonb_build_object('change_type', p_change_type, 'payload', p_payload));

  select name into target_group_name from public.groups where id = p_group_id;
  for other_admin in
    select user_id from public.group_members
    where group_id = p_group_id and role = 'admin' and user_id != auth.uid()
  loop
    perform public.create_notification(
      other_admin.user_id, 'Group change proposed',
      'A change was proposed in ' || target_group_name || ' — your approval is needed.',
      '/groups/' || p_group_id || '/settings'
    );
  end loop;

  return new_id;
end;
$function$;

create or replace function public.confirm_late_payment(p_contribution_id uuid, p_approve boolean, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_group_name text;
  target_member_id uuid;
  is_admin boolean;
  owed_amount numeric;
  fine_amount numeric;
begin
  select group_id, amount, coalesce(missed_fine_amount, 0), member_id
  into target_group_id, owed_amount, fine_amount, target_member_id
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a late payment';
  end if;

  if p_approve then
    update public.contributions
    set status = 'paid_late', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;

    update public.groups
    set safety_fund_balance = safety_fund_balance + owed_amount + fine_amount
    where id = target_group_id;

    perform public.log_audit_event('late_payment_confirmed', 'contribution', p_contribution_id, jsonb_build_object('amount', owed_amount, 'fine_amount', fine_amount));
  else
    update public.contributions
    set status = 'missed',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;
  end if;

  select name into target_group_name from public.groups where id = target_group_id;
  perform public.create_notification(
    target_member_id,
    case when p_approve then 'Late payment accepted' else 'Late payment not accepted' end,
    case when p_approve
      then 'Your late payment for ' || target_group_name || ' was confirmed.'
      else 'Your late payment for ' || target_group_name || ' was not accepted' || coalesce(': ' || p_reason, '.')
    end,
    '/groups/' || target_group_id
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- Invite codes (Section 3.4's weak-tie invites — no commission, see the
-- header note above).
-- ---------------------------------------------------------------------

alter table public.profiles add column invite_code text unique;
alter table public.profiles add column referred_by uuid references auth.users (id);

create function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::text, 6, '0');
    select exists (select 1 from public.profiles where invite_code = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

update public.profiles set invite_code = public.generate_invite_code() where invite_code is null;

alter table public.profiles alter column invite_code set not null;
alter table public.profiles alter column invite_code set default public.generate_invite_code();

-- handle_new_user (Phase 1) also needs to set an invite code on every new
-- profile row going forward — replaced with the same body plus this one
-- addition, same signature/trigger, no re-attachment needed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, invite_code)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.phone, public.generate_invite_code());
  return new;
end;
$$;

create function public.redeem_invite_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_id uuid;
  already_referred uuid;
begin
  select referred_by into already_referred from public.profiles where id = auth.uid();
  if already_referred is not null then
    return; -- already redeemed one; silently a no-op, not an error
  end if;

  select id into referrer_id from public.profiles where invite_code = p_code;
  if referrer_id is null or referrer_id = auth.uid() then
    raise exception 'Invalid invite code';
  end if;

  update public.profiles set referred_by = referrer_id where id = auth.uid();
end;
$$;

create function public.get_referral_stats()
returns table (invite_code text, referred_count int)
language sql
security definer
set search_path = public
stable
as $$
  select p.invite_code, (
    select count(*)::int from public.profiles r where r.referred_by = p.id
  )
  from public.profiles p where p.id = auth.uid();
$$;
