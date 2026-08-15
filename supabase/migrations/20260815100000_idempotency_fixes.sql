-- Idempotency audit fixes. The recurring gap found: every RPC that
-- *updates* an existing row with a WHERE status = 'expected_state'
-- guard was already safe throughout this codebase — the gap was
-- consistently at the *creation* step of MoMo-initiated flows, where an
-- unconditional INSERT plus a real external MTN API call meant a
-- double-click or a client retry-after-timeout could fire a second real
-- MoMo Collections/Disbursements request before the first one's outcome
-- was even known.

-- initiate_wallet_topup's return type changes (uuid -> a row telling the
-- caller whether this is a genuinely new attempt or an existing one it
-- should reuse), so this needs DROP + CREATE rather than REPLACE -
-- same documented gotcha as every other signature change in this
-- project. The route (app/api/momo/collections/wallet-topup/route.ts)
-- is updated alongside this to only call the real MTN Request to Pay
-- when is_new is true.
drop function if exists public.initiate_wallet_topup(numeric, text, text);

create function public.initiate_wallet_topup(p_amount numeric, p_phone text, p_reference_id text)
returns table (id uuid, reference_id text, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
  new_id uuid;
begin
  perform public.check_rate_limit('initiate_wallet_topup', 5);

  if not public.has_wallet_consent() then
    raise exception 'You must consent to Uzuza personal wallet custody before topping up';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  -- Reuse a still-open attempt from the last few minutes instead of
  -- starting a second real MoMo Request to Pay for what's really the
  -- same underlying action (double-click, or a client retrying after a
  -- timeout where the first request actually went through).
  select wt.id, wt.collection_reference_id into existing
  from public.wallet_transactions wt
  where wt.user_id = auth.uid()
    and wt.type = 'topup'
    and wt.status = 'pending'
    and wt.created_at > now() - interval '5 minutes'
  order by wt.created_at desc
  limit 1;

  if existing.id is not null then
    return query select existing.id, existing.collection_reference_id, false;
    return;
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, phone, collection_reference_id)
  values (auth.uid(), 'topup', p_amount, 'pending', p_phone, p_reference_id)
  returning wallet_transactions.id into new_id;

  return query select new_id, p_reference_id, true;
end;
$$;

-- Same shape of fix for withdrawals — reuse an existing pending
-- withdrawal instead of firing a second real MTN Disbursement, which
-- would be an actual double debit, not just a duplicate log row. Return
-- type is changing (adding is_new), so this needs DROP + CREATE too.
drop function if exists public.request_wallet_withdrawal(numeric, text);

create function public.request_wallet_withdrawal(p_amount numeric, p_phone text)
returns table (id uuid, reference text, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  new_id uuid;
  ref text;
  existing record;
begin
  perform public.require_fund_release_mfa();
  perform public.check_rate_limit('request_wallet_withdrawal', 60);

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  perform pg_advisory_xact_lock(hashtext('uzuza_wallet_' || auth.uid()::text));

  select wt.id, wt.disbursement_reference_id into existing
  from public.wallet_transactions wt
  where wt.user_id = auth.uid()
    and wt.type = 'withdrawal'
    and wt.status = 'pending'
  order by wt.created_at desc
  limit 1;

  if existing.id is not null then
    return query select existing.id, existing.disbursement_reference_id, false;
    return;
  end if;

  select public.get_wallet_balance() into bal;
  if bal < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  ref := 'UZW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.wallet_transactions (user_id, type, amount, status, phone, disbursement_reference_id)
  values (auth.uid(), 'withdrawal', p_amount, 'pending', p_phone, ref)
  returning wallet_transactions.id into new_id;

  perform public.log_audit_event('wallet_withdrawal_requested', 'wallet_transaction', new_id, jsonb_build_object('amount', p_amount));

  return query select new_id, ref, true;
end;
$$;

-- create_p2p_request: no external API call here (P2P money moves off-
-- platform), but a double-click/resubmit still created two separate
-- rows with two different references for what the user intended as one
-- ask - the counterparty would see it twice. Reuse a still-pending,
-- matching request from the last minute instead.
create or replace function public.create_p2p_request(p_contact text, p_direction text, p_amount numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  counterparty_id uuid;
  counterparty_name text;
  my_name text;
  new_id uuid;
  ref text;
  v_payer uuid;
  v_payee uuid;
  existing_id uuid;
begin
  perform public.check_rate_limit('create_p2p_request', 5);

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_direction not in ('request', 'send') then
    raise exception 'Invalid direction';
  end if;

  select p.id, p.full_name into counterparty_id, counterparty_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id <> auth.uid()
    and (p.phone = p_contact or lower(u.email) = lower(p_contact))
  limit 1;

  if counterparty_id is null then
    raise exception 'No Uzuza account found for that phone number or email';
  end if;

  if p_direction = 'request' then
    v_payee := auth.uid();
    v_payer := counterparty_id;
  else
    v_payer := auth.uid();
    v_payee := counterparty_id;
  end if;

  select id into existing_id
  from public.p2p_requests
  where initiator_id = auth.uid()
    and payer_id = v_payer
    and payee_id = v_payee
    and amount = p_amount
    and status = 'pending'
    and created_at > now() - interval '1 minute'
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  ref := 'UZP2P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.p2p_requests (initiator_id, payer_id, payee_id, amount, note, reference)
  values (auth.uid(), v_payer, v_payee, p_amount, p_note, ref)
  returning id into new_id;

  select full_name into my_name from public.profiles where id = auth.uid();

  perform public.create_notification(
    counterparty_id,
    case when p_direction = 'request' then 'Money requested' else 'Money coming your way' end,
    case when p_direction = 'request'
      then coalesce(my_name, 'A member') || ' requested ' || p_amount::text || ' RWF from you.'
      else coalesce(my_name, 'A member') || ' wants to send you ' || p_amount::text || ' RWF.'
    end,
    '/pay'
  );

  return new_id;
end;
$$;

-- approve_payout: the entry guard (status must be 'pending' to even
-- start processing) already prevents most double-processing, but the
-- final UPDATE had no guard of its own - a narrow race exists where two
-- concurrent approve_payout calls (different admins, near-simultaneous)
-- both read status='pending' before either commits, and if the faster
-- one's approval is enough to trigger a downstream complete_payout
-- before the slower one finishes, the slower one's un-guarded UPDATE
-- could flip a since-completed payout back to 'approved'. Re-checking
-- status in the UPDATE's own WHERE clause closes that regardless of
-- timing.
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
    update public.payout_requests set status = 'approved' where id = p_payout_request_id and status = 'pending';

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

-- reserve_spot: the capacity check (member_count >= target_size) and
-- the inserts that follow it aren't atomic against each other - two
-- users reserving the last open spot at nearly the same time can both
-- read "not full yet" before either's insert commits, letting a group
-- overshoot its target size. Same advisory-lock pattern already used
-- for the wallet/custody-cap checks, keyed per-group so it only
-- serializes reservations for the *same* group, not globally.
create or replace function public.reserve_spot(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  member_count int;
  fee numeric;
  new_reservation_id uuid;
begin
  select * into g from public.groups where id = p_group_id;
  if g.id is null then
    raise exception 'Group not found';
  end if;
  if not g.is_matching_group or g.status != 'forming' then
    raise exception 'This group is not open for reservations';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then
    raise exception 'Already in this group';
  end if;

  perform pg_advisory_xact_lock(hashtext('uzuza_group_capacity_' || p_group_id::text));

  select count(*) into member_count from public.group_members where group_id = p_group_id;
  if member_count >= g.target_size then
    raise exception 'Group is full';
  end if;

  fee := least(g.contribution_amount * 0.05, 50000);

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, auth.uid(), 'prospective');

  insert into public.reservations (group_id, user_id, fee_amount, unique_reference)
  values (
    p_group_id, auth.uid(), fee,
    'UZR-' || substr(p_group_id::text, 1, 6) || '-' || substr(auth.uid()::text, 1, 6)
  )
  returning id into new_reservation_id;

  return new_reservation_id;
end;
$$;
