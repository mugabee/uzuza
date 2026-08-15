-- Uzuza-held group payouts now land in the recipient's personal wallet
-- balance instead of disbursing straight to their phone with nothing to
-- show for it inside the app. This is a pure re-attribution of money
-- Uzuza already holds (moves from the group's custody_ledger entry to
-- the user's personal wallet_transactions balance), not new money
-- entering custody - the platform-wide cap check doesn't need to change
-- for this specific move, but get_wallet_balance and the cap formula
-- used by future top-ups both need to count it.
--
-- group_owned payouts are untouched: that money never passes through
-- Uzuza at all, so it stays purely informational in the activity feed.

alter table public.wallet_transactions
  add column source_group_id uuid references public.groups (id);

create or replace function public.get_wallet_balance()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(
    case
      when type = 'topup' and status = 'completed' then amount
      when type = 'payout_credit' and status = 'completed' then amount
      when type = 'withdrawal' and status in ('completed', 'pending') then -amount
      else 0
    end
  ), 0)
  from public.wallet_transactions
  where user_id = auth.uid();
$$;

create or replace function public.momo_confirm_wallet_topup(p_transaction_id uuid, p_reference_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  select user_id, amount into v_user, v_amount
  from public.wallet_transactions
  where id = p_transaction_id
    and collection_reference_id = p_reference_id
    and status = 'pending'
    and type = 'topup';

  if v_user is null then
    raise exception 'Transaction not found or not awaiting confirmation';
  end if;

  select
    coalesce((select sum(amount) from public.custody_ledger where swept_at is null), 0)
    + coalesce((select sum(amount) from public.wallet_transactions where type = 'topup' and status = 'completed'), 0)
    + coalesce((select sum(amount) from public.wallet_transactions where type = 'payout_credit' and status = 'completed'), 0)
    - coalesce((select sum(amount) from public.wallet_transactions where type = 'withdrawal' and status in ('completed', 'pending')), 0)
  into currently_held;
  select custody_cap_amount into cap from public.platform_settings where id = 1;

  if currently_held + v_amount > cap then
    update public.wallet_transactions
    set status = 'failed', failure_reason = 'Platform custody cap reached'
    where id = p_transaction_id;
    raise exception 'Platform custody cap reached — cannot hold this deposit right now';
  end if;

  update public.wallet_transactions
  set status = 'completed', completed_at = now()
  where id = p_transaction_id;

  perform public.log_audit_event('wallet_topup_confirmed', 'wallet_transaction', p_transaction_id, jsonb_build_object('amount', v_amount, 'user_id', v_user));
  perform public.create_notification(v_user, 'Deposit confirmed', v_amount::text || ' RWF added to your Uzuza wallet.', '/wallet');
end;
$$;

-- Called by the sweep-out cron (service role only) for an approved
-- payout on a uzuza_held group. Re-attributes the money from the
-- group's open custody_ledger position to the recipient's personal
-- wallet in one function, so both sides of the ledger move together -
-- never just one, which would either double-count or silently lose
-- track of funds Uzuza is holding.
create function public.sweep_uzuza_held_payout_to_wallet(p_payout_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_recipient uuid;
  v_amount numeric;
  v_account_type public.account_type;
  v_phone text;
  v_wallet_tx_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  select pr.group_id, pr.recipient_user_id, pr.amount, g.account_type
  into v_group_id, v_recipient, v_amount, v_account_type
  from public.payout_requests pr
  join public.groups g on g.id = pr.group_id
  where pr.id = p_payout_request_id
    and pr.status = 'approved'
    and pr.swept_at is null
  for update of pr;

  if v_group_id is null then
    raise exception 'Payout request not found or not ready to sweep';
  end if;
  if v_account_type <> 'uzuza_held' then
    raise exception 'This payout is not on a Uzuza-held custody group';
  end if;

  select phone into v_phone from public.profiles where id = v_recipient;

  insert into public.wallet_transactions (user_id, type, amount, status, phone, source_group_id, completed_at)
  values (v_recipient, 'payout_credit', v_amount, 'completed', coalesce(v_phone, ''), v_group_id, now())
  returning id into v_wallet_tx_id;

  update public.payout_requests
  set status = 'completed',
      transaction_id = 'WALLET-' || v_wallet_tx_id::text,
      completed_at = now(),
      swept_at = now()
  where id = p_payout_request_id;

  update public.custody_ledger
  set swept_at = now(), swept_reference = 'WALLET-' || v_wallet_tx_id::text
  where group_id = v_group_id and swept_at is null;

  perform public.log_audit_event(
    'payout_swept_to_wallet', 'payout_request', p_payout_request_id,
    jsonb_build_object('amount', v_amount, 'recipient', v_recipient, 'wallet_transaction_id', v_wallet_tx_id)
  );
  perform public.create_notification(
    v_recipient, 'Payout added to your wallet',
    v_amount::text || ' RWF from your group payout is now in your Uzuza wallet — withdraw anytime from the Wallet tab.',
    '/wallet'
  );

  return v_wallet_tx_id;
end;
$$;

create or replace function public.get_wallet_transactions()
returns table (
  kind text,
  direction text,
  amount numeric,
  group_name text,
  group_id uuid,
  occurred_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select 'Payout received', 'in', pr.amount, g.name, g.id, pr.completed_at as occurred_at
  from public.payout_requests pr
  join public.groups g on g.id = pr.group_id
  where pr.recipient_user_id = auth.uid() and pr.status = 'completed' and g.account_type = 'group_owned'

  union all

  select 'Payout received', 'in', wt.amount, g.name, g.id, wt.completed_at as occurred_at
  from public.wallet_transactions wt
  left join public.groups g on g.id = wt.source_group_id
  where wt.user_id = auth.uid() and wt.type = 'payout_credit' and wt.status = 'completed'

  union all

  select 'Wallet top-up', 'in', wt.amount, null::text, null::uuid, wt.completed_at as occurred_at
  from public.wallet_transactions wt
  where wt.user_id = auth.uid() and wt.type = 'topup' and wt.status = 'completed'

  union all

  select 'Wallet withdrawal', 'out', wt.amount, null::text, null::uuid, wt.completed_at as occurred_at
  from public.wallet_transactions wt
  where wt.user_id = auth.uid() and wt.type = 'withdrawal' and wt.status = 'completed'

  union all

  select 'Contribution', 'out', c.amount, g.name, g.id, c.confirmed_at as occurred_at
  from public.contributions c
  join public.groups g on g.id = c.group_id
  where c.member_id = auth.uid() and c.status in ('confirmed', 'paid_late')

  union all

  select 'Event pledge', 'out', ep.amount, g.name, g.id, ep.confirmed_at as occurred_at
  from public.event_pledges ep
  join public.groups g on g.id = ep.group_id
  where ep.pledger_id = auth.uid() and ep.status = 'confirmed'

  union all

  select 'Reservation fee', 'out', r.fee_amount, g.name, g.id, r.confirmed_at as occurred_at
  from public.reservations r
  join public.groups g on g.id = r.group_id
  where r.user_id = auth.uid() and r.status = 'confirmed'

  order by occurred_at desc nulls last
  limit 100;
$$;
