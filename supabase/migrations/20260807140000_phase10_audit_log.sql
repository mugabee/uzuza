-- Phase 10 (2/3) — Audit log.
-- Section 6: "All financial and approval actions are logged for
-- auditability — this applies to every entity above, not just the core
-- ones." No audit_log table existed; nothing wrote to one. This adds a
-- single table + helper, and threads a call through every high-stakes RPC
-- that changes financial or governance state. Rows only ever come from
-- security definer functions (the function owner's implicit bypass), same
-- write path as every other table in this app — no client insert policy.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
create policy "staff can see the audit log" on public.audit_log
  for select using (public.is_staff());

create function public.log_audit_event(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
$$;

create function public.list_audit_log(p_entity_type text default null, p_limit int default 100)
returns setof public.audit_log
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
  select * from public.audit_log
  where p_entity_type is null or entity_type = p_entity_type
  order by created_at desc
  limit least(p_limit, 500);
end;
$$;

create or replace function public.approve_payout(p_payout_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_status public.payout_status;
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
  end if;
end;
$$;

create or replace function public.complete_payout(p_payout_request_id uuid, p_transaction_id text, p_screenshot_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
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
end;
$$;

create or replace function public.request_payout(p_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_recipient uuid;
  target_status public.cycle_status;
  total_amount numeric;
  is_admin boolean;
  new_request_id uuid;
begin
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

  return new_request_id;
end;
$$;

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
  where cycle_id = target_cycle_id and status != 'confirmed';

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;
end;
$$;

create or replace function public.set_account_type(p_group_id uuid, p_account_type account_type, p_consent boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can change the account type';
  end if;

  if p_account_type = 'uzuza_held' and not p_consent then
    raise exception 'Explicit consent is required to hold funds in Uzuza custody';
  end if;

  if p_account_type = 'uzuza_held' then
    perform public.require_fund_release_mfa();
  end if;

  update public.groups set account_type = p_account_type where id = p_group_id;

  if p_account_type = 'uzuza_held' then
    insert into public.custody_consents (group_id, user_id)
    values (p_group_id, auth.uid())
    on conflict (group_id, user_id) do update set consented_at = now();
  end if;

  perform public.log_audit_event('account_type_changed', 'group', p_group_id, jsonb_build_object('new_account_type', p_account_type));
end;
$$;

create or replace function public.propose_group_change(p_group_id uuid, p_change_type proposal_change_type, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  new_id uuid;
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

  return new_id;
end;
$$;

create or replace function public.approve_group_change(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_status public.proposal_status;
  target_payload jsonb;
  target_change_type public.proposal_change_type;
  target_created_at timestamptz;
  is_admin boolean;
  threshold text;
  admin_count int;
  required_approvals int;
  current_approvals int;
  should_apply boolean := false;
begin
  select group_id, status, payload, change_type, created_at
  into target_group_id, target_status, target_payload, target_change_type, target_created_at
  from public.group_change_proposals where id = p_proposal_id;

  if target_group_id is null then
    raise exception 'Proposal not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can approve a proposal';
  end if;

  if target_status != 'pending' then
    raise exception 'Proposal is not pending';
  end if;

  insert into public.proposal_approvals (proposal_id, approved_by)
  values (p_proposal_id, auth.uid())
  on conflict (proposal_id, approved_by) do nothing;

  select approval_threshold into threshold from public.groups where id = target_group_id;
  select count(*) into admin_count
  from public.group_members where group_id = target_group_id and role = 'admin';
  select count(*) into current_approvals
  from public.proposal_approvals where proposal_id = p_proposal_id;

  required_approvals := case threshold
    when '1' then 1
    when '2-of-3' then least(2, admin_count)
    when 'all' then admin_count
    else 1
  end;

  if current_approvals >= required_approvals then
    should_apply := true;
  elsif now() > target_created_at + interval '5 days'
        and current_approvals * 2 > admin_count then
    should_apply := true;
  end if;

  if not should_apply then
    return;
  end if;

  if target_change_type = 'settings' then
    update public.groups set
      contribution_amount = coalesce((target_payload->>'contribution_amount')::numeric, contribution_amount),
      target_size = coalesce((target_payload->>'target_size')::int, target_size),
      approval_threshold = coalesce(target_payload->>'approval_threshold', approval_threshold),
      momo_number = coalesce(target_payload->>'momo_number', momo_number)
    where id = target_group_id;
  elsif target_change_type = 'role_change' then
    update public.group_members
    set role = (target_payload->>'new_role')::public.member_role
    where group_id = target_group_id and user_id = (target_payload->>'target_user_id')::uuid;
  end if;

  update public.group_change_proposals
  set status = 'applied', applied_at = now()
  where id = p_proposal_id;

  perform public.log_audit_event('group_change_applied', 'group_change_proposal', p_proposal_id, jsonb_build_object('change_type', target_change_type, 'payload', target_payload));
end;
$$;

create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can remove a member';
  end if;

  update public.group_members
  set membership_status = 'removed'
  where group_id = p_group_id and user_id = p_user_id;

  if not found then
    raise exception 'Member not found in this group';
  end if;

  perform public.log_audit_event('member_removed', 'group_member', p_user_id, jsonb_build_object('group_id', p_group_id));
end;
$$;

create or replace function public.decide_exit(p_exit_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
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
end;
$$;

create or replace function public.decide_pause(p_pause_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  is_admin boolean;
begin
  select group_id, user_id into target_group_id, target_user_id
  from public.pause_requests where id = p_pause_request_id;

  if target_group_id is null then
    raise exception 'Pause request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can decide a pause request';
  end if;

  update public.pause_requests
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.pause_status,
      decided_by = auth.uid(), decided_at = now()
  where id = p_pause_request_id and status = 'pending';

  if not found then
    raise exception 'Pause request not found or already decided';
  end if;

  if p_approve then
    update public.group_members
    set membership_status = 'paused'
    where group_id = target_group_id and user_id = target_user_id;
  end if;

  perform public.log_audit_event('pause_decided', 'pause_request', p_pause_request_id, jsonb_build_object('approved', p_approve));
end;
$$;

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

  perform public.log_audit_event('missed_payment_reported', 'contribution', p_contribution_id, jsonb_build_object('fine_amount', p_fine_amount, 'recipient_paid', recipient_paid));
end;
$$;

create or replace function public.decide_id_verification(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.id_verification_requests
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.id_verification_status,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id and status = 'pending';

  if not found then
    raise exception 'Request not found or already decided';
  end if;

  perform public.log_audit_event('id_verification_decided', 'id_verification_request', p_id, jsonb_build_object('approved', p_approve));
end;
$$;

create or replace function public.close_mediation_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.mediation_cases set status = 'closed' where id = p_case_id;
  if not found then
    raise exception 'Mediation case not found';
  end if;

  perform public.log_audit_event('mediation_case_closed', 'mediation_case', p_case_id, '{}'::jsonb);
end;
$$;

create or replace function public.resolve_unmatched_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.unmatched_payments
  set status = 'resolved', resolved_at = now()
  where id = p_id and status = 'open';

  if not found then
    raise exception 'Unmatched payment not found or already resolved';
  end if;

  perform public.log_audit_event('unmatched_payment_resolved', 'unmatched_payment', p_id, '{}'::jsonb);
end;
$$;
