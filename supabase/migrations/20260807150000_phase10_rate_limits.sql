-- Phase 10 (3/3) — Rate limiting beyond chat.
-- Section 3.6 requires "rate limiting for spam prevention" platform-wide;
-- until now it only existed for send_chat_message (a 2-second per-user
-- throttle, see migration 20260806190000). OTP request throttling is
-- already covered by Supabase's own auth config (rate_limit_otp,
-- sms_max_frequency) — verified, no app-level gap there. This generalizes
-- the same "reject if a matching row exists within N seconds" guard to a
-- few more plausible spam/abuse vectors, backed by one small shared table
-- rather than bespoke columns on each target table.

create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  action_key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on public.rate_limit_events (user_id, action_key, created_at desc);

alter table public.rate_limit_events enable row level security;
-- No select/insert policy for regular clients — this table is only ever
-- touched from inside security definer functions, same as audit_log.

create function public.check_rate_limit(p_action_key text, p_window_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.rate_limit_events
    where user_id = auth.uid()
      and action_key = p_action_key
      and created_at > now() - make_interval(secs => p_window_seconds)
  ) then
    raise exception 'Too many requests — please wait a moment and try again';
  end if;

  insert into public.rate_limit_events (user_id, action_key) values (auth.uid(), p_action_key);
end;
$$;

create or replace function public.submit_contribution_proof(p_contribution_id uuid, p_transaction_id text, p_screenshot_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('submit_contribution_proof', 5);

  update public.contributions
  set status = 'submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      submitted_at = now()
  where id = p_contribution_id
    and member_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Contribution not found, not yours, or not pending';
  end if;
end;
$$;

create or replace function public.request_mediation(p_group_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  computed_stakes public.mediation_stakes;
  g_account_type public.account_type;
  has_pending_payout boolean;
begin
  perform public.check_rate_limit('request_mediation', 5);

  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can request mediation';
  end if;

  select account_type into g_account_type from public.groups where id = p_group_id;
  select exists (
    select 1 from public.payout_requests
    where group_id = p_group_id and status != 'completed'
  ) into has_pending_payout;

  computed_stakes := case
    when g_account_type = 'uzuza_held' or has_pending_payout then 'financial'
    else 'general'
  end;

  insert into public.mediation_cases (group_id, raised_by, reason, stakes)
  values (p_group_id, auth.uid(), p_reason, computed_stakes)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.log_unmatched_payment(p_description text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  perform public.check_rate_limit('log_unmatched_payment', 5);

  insert into public.unmatched_payments (reported_by, description, amount)
  values (auth.uid(), p_description, p_amount)
  returning id into new_id;

  return new_id;
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

  return new_request_id;
end;
$$;
