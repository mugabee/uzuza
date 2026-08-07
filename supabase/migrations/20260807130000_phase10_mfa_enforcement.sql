-- Phase 10 (1/3) — MFA on fund-release actions.
-- Section 3.7 / Section 7 risk register: "Multi-factor protection required
-- on any admin action involving fund release." Supabase's project auth
-- config already has TOTP MFA enrollment/verification enabled; nothing in
-- the app used it until now. Enforcement is opt-in-to-use: an admin who
-- hasn't enrolled a verified factor is blocked from the specific actions
-- that release or move funds, with a clear message pointing at enrollment
-- (not a silent failure). /api/cron/sweep-out runs under the service-role
-- key with a CRON_SECRET header, not a user session — AAL doesn't apply
-- there, so it's untouched.

create or replace function public.has_verified_mfa_factor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = auth.uid() and status = 'verified'
  );
$$;

create or replace function public.session_is_aal2()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function public.require_fund_release_mfa()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_verified_mfa_factor() then
    raise exception 'Multi-factor authentication required — enroll a second factor at /profile/security before approving or completing a payout';
  end if;
  if not public.session_is_aal2() then
    raise exception 'This session has not completed multi-factor verification — sign in again and complete the second-factor challenge';
  end if;
end;
$$;

-- approve_payout: require MFA before an admin's approval counts.
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

  if current_approvals >= required_approvals then
    update public.payout_requests set status = 'approved' where id = p_payout_request_id;
  end if;
end;
$$;

-- complete_payout: require MFA before the final release is recorded.
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
end;
$$;

-- confirm_contribution: require MFA only on the uzuza_held (custody) path
-- — group-owned confirmations don't move funds through Uzuza at all, so
-- gating those too would block the common case for no real fund-release
-- protection benefit.
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

-- set_account_type: require MFA specifically when switching a group INTO
-- uzuza_held custody — switching back to group_owned doesn't need it.
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
end;
$$;
