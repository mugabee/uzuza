-- Two follow-ups from a fresh gap audit:
--
-- 1. mark_p2p_paid/confirm_p2p_received/decline_p2p_request/cancel_p2p_request
-- were the only state-changing P2P functions without rate limiting, unlike
-- create_p2p_request/find_user_by_contact — inconsistent, closing the gap
-- with the same 5-second guard used everywhere else in this app.
--
-- 2. Admin-settable due dates per cycle, the foundation for a real
-- "payment due soon" reminder system (previously: only a cycle start date
-- and the group's frequency existed, no way to actually know when a
-- contribution is due).

create or replace function public.mark_p2p_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payee uuid;
  v_amount numeric;
begin
  perform public.check_rate_limit('mark_p2p_paid', 5);

  select payee_id, amount into v_payee, v_amount
  from public.p2p_requests where id = p_id and payer_id = auth.uid() and status = 'pending';

  if v_payee is null then
    raise exception 'Request not found or not yours to mark paid';
  end if;

  update public.p2p_requests set status = 'paid', paid_at = now() where id = p_id;

  perform public.create_notification(
    v_payee, 'Payment marked as sent',
    'Confirm you received ' || v_amount::text || ' RWF.',
    '/pay'
  );
end;
$$;

create or replace function public.confirm_p2p_received(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer uuid;
  v_amount numeric;
begin
  perform public.check_rate_limit('confirm_p2p_received', 5);

  select payer_id, amount into v_payer, v_amount
  from public.p2p_requests where id = p_id and payee_id = auth.uid() and status = 'paid';

  if v_payer is null then
    raise exception 'Request not found or not yours to confirm';
  end if;

  update public.p2p_requests set status = 'confirmed', confirmed_at = now() where id = p_id;

  perform public.create_notification(
    v_payer, 'Payment confirmed',
    'Your ' || v_amount::text || ' RWF payment was confirmed received.',
    '/pay'
  );
end;
$$;

create or replace function public.decline_p2p_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  perform public.check_rate_limit('decline_p2p_request', 5);

  update public.p2p_requests
  set status = 'declined'
  where id = p_id and status = 'pending' and (payer_id = auth.uid() or payee_id = auth.uid())
  returning (case when payer_id = auth.uid() then payee_id else payer_id end) into v_other;

  if v_other is null then
    raise exception 'Request not found or already resolved';
  end if;

  perform public.create_notification(v_other, 'Request declined', 'A pending money request was declined.', '/pay');
end;
$$;

create or replace function public.cancel_p2p_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('cancel_p2p_request', 5);

  update public.p2p_requests
  set status = 'cancelled'
  where id = p_id and status = 'pending' and initiator_id = auth.uid();
end;
$$;

-- Due dates: nullable so existing/older cycles aren't retroactively broken,
-- settable by an admin at or after cycle start. reminded_at on
-- contributions prevents the reminder cron (added separately) from
-- notifying the same pending contribution twice.
alter table public.cycles add column due_date date;
alter table public.contributions add column reminded_at timestamptz;

create function public.set_cycle_due_date(p_cycle_id uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  is_admin boolean;
begin
  select group_id into target_group_id from public.cycles where id = p_cycle_id;
  if target_group_id is null then
    raise exception 'Cycle not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can set the due date';
  end if;

  update public.cycles set due_date = p_due_date where id = p_cycle_id;
end;
$$;
