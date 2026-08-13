-- Personal wallet custody — a real money balance held by Uzuza for an
-- individual user, independent of any group. Explicitly requested and
-- confirmed by the project owner with the regulatory gap understood: this
-- is a materially bigger step than group custody (personal e-money
-- issuance is typically scrutinized harder than group-scoped escrow), and
-- CLAUDE.md's own group-custody guardrails ("Hard platform-wide cap...
-- Automated sweep-out... Honest risk disclosure... Parallel legal/
-- regulatory consultation... critical before real funds move at scale")
-- are treated here as the minimum bar, not optional extras.
--
-- IMPORTANT — same status as every other custody feature in this app:
-- wired to MTN's sandbox only. No production MoMo credentials exist
-- anywhere in this project's configuration. This migration is not
-- clearance to move real money — that requires the legal review
-- CLAUDE.md has flagged since Phase 0 and completing it is on the
-- project owner, not something more code unlocks.

create type public.wallet_transaction_type as enum ('topup', 'withdrawal');
create type public.wallet_transaction_status as enum ('pending', 'completed', 'failed');

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  type public.wallet_transaction_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  status public.wallet_transaction_status not null default 'pending',
  phone text not null,
  collection_reference_id text,
  disbursement_reference_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index wallet_transactions_user_id_idx on public.wallet_transactions (user_id);
create index wallet_transactions_collection_reference_id_idx
  on public.wallet_transactions (collection_reference_id) where collection_reference_id is not null;

alter table public.wallet_transactions enable row level security;
create policy "select own wallet transactions" on public.wallet_transactions
  for select using (auth.uid() = user_id);
-- No insert/update policy for clients — every write goes through the
-- SECURITY DEFINER functions below, same discipline as every other
-- financial table in this app.

-- Explicit, plain-language consent before a user's first top-up — the
-- personal-wallet equivalent of custody_consents for groups. Recorded,
-- not just displayed, so it's auditable.
create table public.wallet_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  consented_at timestamptz not null default now()
);
alter table public.wallet_consents enable row level security;
create policy "select own wallet consent" on public.wallet_consents
  for select using (auth.uid() = user_id);

create function public.consent_to_personal_wallet()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.wallet_consents (user_id) values (auth.uid())
  on conflict (user_id) do nothing;
$$;

create function public.has_wallet_consent()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.wallet_consents where user_id = auth.uid());
$$;

-- Pending withdrawals are reserved (subtracted) immediately, not only once
-- completed — otherwise two withdrawal requests submitted before the
-- first one's disbursement call finishes could both pass a balance check
-- against the same funds.
create function public.get_wallet_balance()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(
    case
      when type = 'topup' and status = 'completed' then amount
      when type = 'withdrawal' and status in ('completed', 'pending') then -amount
      else 0
    end
  ), 0)
  from public.wallet_transactions
  where user_id = auth.uid();
$$;

-- Records the pending row; the actual MTN Request to Pay call happens in
-- the API route right after this returns (same split as every other
-- MoMo flow in this app — the RPC owns the DB write, the route owns the
-- external call).
create function public.initiate_wallet_topup(p_amount numeric, p_phone text, p_reference_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.check_rate_limit('initiate_wallet_topup', 5);

  if not public.has_wallet_consent() then
    raise exception 'You must consent to Uzuza personal wallet custody before topping up';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, phone, collection_reference_id)
  values (auth.uid(), 'topup', p_amount, 'pending', p_phone, p_reference_id)
  returning id into new_id;

  return new_id;
end;
$$;

-- Mirrors momo_confirm_contribution's shape: gated to the service role
-- only (never callable by a client directly), re-derives everything from
-- the already-recorded pending row rather than trusting client input, and
-- enforces the platform-wide cap — deliberately shared with group custody
-- (custody_ledger) rather than a separate personal-only cap, since
-- CLAUDE.md's cap requirement is about total funds Uzuza holds at all,
-- not per feature.
create function public.momo_confirm_wallet_topup(p_transaction_id uuid, p_reference_id text)
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

-- Withdrawing is a fund-release action exactly like completing a payout —
-- same MFA gate. Records the pending, already-reserved withdrawal; the
-- API route performs the actual MTN Disbursements call right after and
-- marks it completed/failed based on the real result.
create function public.request_wallet_withdrawal(p_amount numeric, p_phone text)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  new_id uuid;
  ref text;
begin
  perform public.require_fund_release_mfa();
  perform public.check_rate_limit('request_wallet_withdrawal', 60);

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
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

  return query select new_id, ref;
end;
$$;

create function public.list_my_wallet_transactions()
returns setof public.wallet_transactions
language sql
security definer
set search_path = public
stable
as $$
  select * from public.wallet_transactions where user_id = auth.uid() order by created_at desc limit 100;
$$;
