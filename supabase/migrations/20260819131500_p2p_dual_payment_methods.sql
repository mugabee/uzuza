-- P2P send/request money — dual payment methods.
--
-- Option A (real money movement): pay directly from the Uzuza wallet
-- balance. Reuses the exact same custody-boundary reasoning as
-- contribute_from_wallet — both sides already have a real Uzuza-held
-- wallet balance, so an internal transfer is a single, immediate,
-- atomic ledger movement (Debit sender's user_wallet / Credit
-- recipient's user_wallet), no proof upload or counterparty
-- confirmation needed, since Uzuza already knows the money is real.
--
-- Option B (offline MoMo, unchanged in spirit from the original P2P
-- feature): the two people still pay each other directly via their own
-- MoMo, entirely outside Uzuza's custody. This migration adds real
-- proof-of-payment (screenshot + transaction ID, the same two-part
-- discipline used everywhere else in this app) where the feature
-- previously had a bare "mark as paid" with no proof at all — but
-- deliberately does NOT touch either party's Uzuza wallet balance for
-- this channel. Money that never enters Uzuza's custody can't correctly
-- credit a balance that's supposed to represent what a member can
-- actually withdraw from Uzuza; doing so would let two colluding
-- accounts mint spendable balance for free and cash it out via a real
-- disbursement. Confirmed explicitly rather than assumed, since it's
-- the same overstating-balance risk already flagged and avoided for the
-- earlier wallet-merge and contribute-from-wallet work this session.

-- Reuses the existing payment_channel enum (already used by
-- contributions) rather than inventing a parallel P2P-specific one —
-- 'momo_manual' is exactly "offline MoMo with submitted proof",
-- 'wallet_balance' is exactly Option A.
alter table public.p2p_requests
  add column payment_channel public.payment_channel not null default 'momo_manual',
  add column transaction_id text,
  add column screenshot_path text;

alter table public.wallet_transactions
  add column p2p_request_id uuid references public.p2p_requests (id) on delete set null,
  add column counterparty_user_id uuid references auth.users (id) on delete set null;

-- Storage: private bucket for P2P offline-MoMo proof screenshots, same
-- shape as contribution-proofs — uploader (the payer) or either party
-- can read.
insert into storage.buckets (id, name, public)
values ('p2p-proofs', 'p2p-proofs', false)
on conflict (id) do nothing;

create policy "upload own p2p payment proof" on storage.objects
  for insert with check (
    bucket_id = 'p2p-proofs' and
    exists (
      select 1 from public.p2p_requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.payer_id = auth.uid()
    )
  );

create policy "read own p2p payment proof" on storage.objects
  for select using (
    bucket_id = 'p2p-proofs' and
    exists (
      select 1 from public.p2p_requests r
      where r.id::text = (storage.foldername(name))[1]
        and (r.payer_id = auth.uid() or r.payee_id = auth.uid())
    )
  );

-- Shared helper: executes one real, atomic wallet-to-wallet transfer.
-- Always called with auth.uid() as the payer — either from
-- create_p2p_request (a direct "send" using the wallet, executed
-- immediately) or pay_p2p_from_wallet (paying an incoming "request").
create function public.execute_p2p_wallet_transfer(p_request_id uuid, p_payee uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
begin
  perform pg_advisory_xact_lock(hashtext('uzuza_wallet_' || auth.uid()::text));

  select public.get_wallet_balance() into bal;
  if bal < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, phone, p2p_request_id, counterparty_user_id, completed_at)
  values (auth.uid(), 'p2p_sent', p_amount, 'completed', '', p_request_id, p_payee, now());

  insert into public.wallet_transactions (user_id, type, amount, status, phone, p2p_request_id, counterparty_user_id, completed_at)
  values (p_payee, 'p2p_received', p_amount, 'completed', '', p_request_id, auth.uid(), now());
end;
$$;

-- create_p2p_request: same signature shape as
-- 20260815100000_idempotency_fixes.sql's version plus a trailing
-- p_payment_channel — a real signature change, so the old overload is
-- dropped explicitly rather than left to silently coexist
-- (the create_group overload-debt gotcha documented elsewhere in this
-- project).
drop function if exists public.create_p2p_request(text, text, numeric, text);

create function public.create_p2p_request(
  p_contact text,
  p_direction text,
  p_amount numeric,
  p_note text default null,
  p_payment_channel public.payment_channel default 'momo_manual'
)
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
  if p_payment_channel not in ('momo_manual', 'wallet_balance') then
    raise exception 'Invalid payment method for a P2P transfer';
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
    and payment_channel = p_payment_channel
    and status = 'pending'
    and created_at > now() - interval '1 minute'
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  ref := 'UZP2P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.p2p_requests (initiator_id, payer_id, payee_id, amount, note, reference, payment_channel)
  values (auth.uid(), v_payer, v_payee, p_amount, p_note, ref, p_payment_channel)
  returning id into new_id;

  select full_name into my_name from public.profiles where id = auth.uid();

  -- A direct wallet-funded "send" is real money movement the sender
  -- already has and has explicitly chosen to pay now — execute it
  -- immediately and atomically, same as contribute_from_wallet, rather
  -- than sitting in a 'pending' state waiting for a separate "mark
  -- paid" step that makes no sense for an internal transfer. A wallet-
  -- funded "request" can't be pre-funded here (the payer hasn't agreed
  -- yet) — it stays pending until the payer calls pay_p2p_from_wallet.
  if p_payment_channel = 'wallet_balance' and p_direction = 'send' then
    perform public.execute_p2p_wallet_transfer(new_id, v_payee, p_amount);
    update public.p2p_requests set status = 'confirmed', paid_at = now(), confirmed_at = now() where id = new_id;

    perform public.create_notification(
      counterparty_id, 'Money received',
      coalesce(my_name, 'A member') || ' sent you ' || p_amount::text || ' RWF from their Uzuza wallet.',
      '/pay'
    );
  else
    perform public.create_notification(
      counterparty_id,
      case when p_direction = 'request' then 'Money requested' else 'Money coming your way' end,
      case when p_direction = 'request'
        then coalesce(my_name, 'A member') || ' requested ' || p_amount::text || ' RWF from you.'
        else coalesce(my_name, 'A member') || ' wants to send you ' || p_amount::text || ' RWF.'
      end,
      '/pay'
    );
  end if;

  return new_id;
end;
$$;

-- Pays an incoming (direction='request') P2P request from the payer's
-- wallet balance — the counterpart to a wallet-funded direct send.
create function public.pay_p2p_from_wallet(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payee uuid;
  v_amount numeric;
begin
  select payee_id, amount into v_payee, v_amount
  from public.p2p_requests
  where id = p_id and payer_id = auth.uid() and status = 'pending' and payment_channel = 'wallet_balance';

  if v_payee is null then
    raise exception 'Request not found, not yours to pay, or not set up for wallet payment';
  end if;

  perform public.execute_p2p_wallet_transfer(p_id, v_payee, v_amount);

  update public.p2p_requests set status = 'confirmed', paid_at = now(), confirmed_at = now() where id = p_id;

  perform public.create_notification(
    v_payee, 'Payment received',
    'You received ' || v_amount::text || ' RWF from your Uzuza wallet request.',
    '/pay'
  );
end;
$$;

-- mark_p2p_paid: now takes real proof (transaction ID + screenshot
-- path), the same two-part discipline as contribution proofs — the
-- original P2P feature shipped without this. Restricted to the
-- momo_manual channel; a wallet_balance request should never reach
-- 'pending'->'paid' through this path (it goes straight to 'confirmed'
-- via pay_p2p_from_wallet), so this guards against a client mistakenly
-- calling the wrong endpoint rather than silently doing nothing useful.
drop function if exists public.mark_p2p_paid(uuid);

create function public.mark_p2p_paid(p_id uuid, p_transaction_id text, p_screenshot_path text)
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
  from public.p2p_requests
  where id = p_id and payer_id = auth.uid() and status = 'pending' and payment_channel = 'momo_manual';

  if v_payee is null then
    raise exception 'Request not found, not yours to mark paid, or not set up for offline MoMo';
  end if;

  update public.p2p_requests
  set status = 'paid', paid_at = now(), transaction_id = p_transaction_id, screenshot_path = p_screenshot_path
  where id = p_id;

  perform public.create_notification(
    v_payee, 'Payment marked as sent',
    'Confirm you received ' || v_amount::text || ' RWF.',
    '/pay'
  );
end;
$$;

-- confirm_p2p_received: unchanged in effect (still just a status flip,
-- no wallet balance touched for this channel — see this migration's own
-- header note), only re-declared here for the guard clarity/consistency
-- with the rest of this file.
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

-- capture_wallet_transaction_posting: add the p2p_sent leg. Only the
-- 'p2p_sent' row triggers a posting (one balanced debit/credit pair for
-- the whole transfer); the paired 'p2p_received' row intentionally
-- posts nothing of its own, or the transfer would be double-counted in
-- the ledger.
create or replace function public.capture_wallet_transaction_posting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' and new.type = 'withdrawal' then
      perform public.post_ledger_entry(
        'wallet_withdrawal_reserved', 'wallet_transactions', new.id, 'Withdrawal amount reserved from wallet',
        jsonb_build_array(
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'external_momo_disbursements', 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'INSERT' and new.type = 'payout_credit' and new.status = 'completed' then
      perform public.post_ledger_entry(
        'payout_swept_to_wallet', 'wallet_transactions', new.id, 'Group payout swept into personal wallet',
        jsonb_build_array(
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', new.source_group_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'INSERT' and new.type = 'contribution_payment' and new.status = 'completed' then
      perform public.post_ledger_entry(
        'contribution_paid_from_wallet', 'wallet_transactions', new.id, 'Personal wallet balance moved into a group contribution',
        jsonb_build_array(
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', new.source_group_id, 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'INSERT' and new.type = 'p2p_sent' and new.status = 'completed' then
      perform public.post_ledger_entry(
        'p2p_wallet_transfer', 'wallet_transactions', new.id, 'Peer-to-peer wallet-to-wallet transfer',
        jsonb_build_array(
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.counterparty_user_id, 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
      if new.type = 'topup' and new.status = 'completed' then
        perform public.post_ledger_entry(
          'wallet_topup_completed', 'wallet_transactions', new.id, 'Wallet top-up confirmed',
          jsonb_build_array(
            jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', new.amount),
            jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'credit', 'amount', new.amount)
          )
        );
      elsif new.type = 'withdrawal' and old.status = 'pending' and new.status = 'failed' then
        perform public.post_ledger_entry(
          'wallet_withdrawal_released', 'wallet_transactions', new.id, 'Failed withdrawal — reserved amount released back to wallet',
          jsonb_build_array(
            jsonb_build_object('account_type', 'external_momo_disbursements', 'direction', 'debit', 'amount', new.amount),
            jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'credit', 'amount', new.amount)
          )
        );
      end if;
    end if;
  exception when others then
    insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
    values ('wallet_transaction_' || tg_op, 'wallet_transactions', new.id, sqlerrm);
  end;
  return new;
end;
$$;

-- enforce_wallet_balance_non_negative: add both p2p legs to the
-- per-user balance formula.
create or replace function public.enforce_wallet_balance_non_negative()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_balance numeric;
begin
  v_user := coalesce(new.user_id, old.user_id);
  if v_user is null then
    return new;
  end if;

  select coalesce(sum(
    case
      when type = 'topup' and status = 'completed' then amount
      when type = 'payout_credit' and status = 'completed' then amount
      when type = 'withdrawal' and status in ('completed', 'pending') then -amount
      when type = 'contribution_payment' and status = 'completed' then -amount
      when type = 'p2p_sent' and status = 'completed' then -amount
      when type = 'p2p_received' and status = 'completed' then amount
      else 0
    end
  ), 0)
  into v_balance
  from public.wallet_transactions
  where user_id = v_user and id <> new.id;

  v_balance := v_balance + case
    when new.type = 'topup' and new.status = 'completed' then new.amount
    when new.type = 'payout_credit' and new.status = 'completed' then new.amount
    when new.type = 'withdrawal' and new.status in ('completed', 'pending') then -new.amount
    when new.type = 'contribution_payment' and new.status = 'completed' then -new.amount
    when new.type = 'p2p_sent' and new.status = 'completed' then -new.amount
    when new.type = 'p2p_received' and new.status = 'completed' then new.amount
    else 0
  end;

  if v_balance < 0 then
    raise exception 'This wallet transaction would leave user % with a negative balance (%)', v_user, v_balance;
  end if;

  return new;
end;
$$;

-- get_wallet_transactions: add the P2P wallet-transfer display arm.
-- Offline-MoMo P2P deliberately still has no display arm here — it
-- never touches wallet_transactions at all, per this migration's own
-- header note.
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

  union all

  select
    case when wt.type = 'p2p_sent' then 'Sent to ' || coalesce(cp.full_name, 'a member')
         else 'Received from ' || coalesce(cp.full_name, 'a member') end,
    case when wt.type = 'p2p_sent' then 'out' else 'in' end,
    wt.amount, null::text, null::uuid, wt.completed_at as occurred_at
  from public.wallet_transactions wt
  left join public.profiles cp on cp.id = wt.counterparty_user_id
  where wt.user_id = auth.uid() and wt.type in ('p2p_sent', 'p2p_received') and wt.status = 'completed'

  order by occurred_at desc nulls last
  limit 100;
$$;
