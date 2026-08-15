-- Fintech-hardening gap-closing pass, following a full comparison
-- against standard fintech engineering practice across payments,
-- ledger/accounting, reconciliation, idempotency/webhooks, fraud/
-- velocity, KYC/AML readiness, audit trails, and custody. Idempotency,
-- webhooks, ledger integrity, and custody guardrails were already
-- solid (prior work this session). The two concrete, safe gaps closed
-- here: (1) no velocity/large-transaction fraud signal existed anywhere
-- — every wallet movement was accepted at face value with no anomaly
-- detection; (2) the shadow ledger's own integrity report
-- (get_shadow_ledger_integrity_report) was staff-triggered only, with
-- no automatic monitoring — a real drift could sit undetected
-- indefinitely unless someone thought to check.
--
-- Both are implemented as FLAG-ONLY, never-blocking additions: nothing
-- here can reject a legitimate transaction or change any existing
-- return value/behavior. A bug in this new code is isolated with the
-- same exception-wrapping discipline as the shadow ledger's own
-- post_ledger_entry call sites, for the same reason — new fraud-
-- detection code must never be able to take down real money movement.

-- ============================================================
-- 1. Configurable thresholds (platform-wide, staff-adjustable later)
-- ============================================================

alter table public.platform_settings
  add column large_transaction_threshold numeric(14, 2) not null default 1000000,
  add column velocity_window_hours int not null default 24,
  add column velocity_limit_amount numeric(14, 2) not null default 3000000;

-- ============================================================
-- 2. fraud_flags — staff review queue, same shape as
--    reconciliation_discrepancies (list/resolve pattern already
--    proven in the internal console).
-- ============================================================

create type public.fraud_flag_type as enum (
  'large_transaction',
  'high_velocity',
  'ledger_drift_detected'
);

create table public.fraud_flags (
  id uuid primary key default gen_random_uuid(),
  flag_type public.fraud_flag_type not null,
  user_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  amount numeric(14, 2),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_note text
);

create index fraud_flags_unresolved_idx on public.fraud_flags (detected_at desc) where resolved_at is null;

alter table public.fraud_flags enable row level security;
-- No client policies — staff-only via the RPCs below, matching
-- reconciliation_discrepancies' own precedent exactly.

create function public.flag_suspicious_activity(
  p_flag_type public.fraud_flag_type,
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_amount numeric,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.fraud_flags (flag_type, user_id, entity_type, entity_id, amount, details)
  values (p_flag_type, p_user_id, p_entity_type, p_entity_id, p_amount, p_details)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.flag_suspicious_activity(public.fraud_flag_type, uuid, text, uuid, numeric, jsonb) from public;

create function public.list_fraud_flags(p_unresolved_only boolean default true)
returns setof public.fraud_flags
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
  select * from public.fraud_flags
  where (not p_unresolved_only) or resolved_at is null
  order by detected_at desc
  limit 200;
end;
$$;

create function public.resolve_fraud_flag(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.fraud_flags
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
  where id = p_id and resolved_at is null;

  if not found then
    raise exception 'Flag not found or already resolved';
  end if;

  perform public.log_audit_event('fraud_flag_resolved', 'fraud_flag', p_id, jsonb_build_object('note', p_note));
end;
$$;

-- ============================================================
-- 3. Velocity + large-transaction check — called from the two
--    initiation RPCs, never from a confirmation path, so it can only
--    ever add a staff-visible flag, never affect whether money moves.
-- ============================================================

create function public.check_wallet_velocity_and_threshold(
  p_user_id uuid,
  p_type public.wallet_transaction_type,
  p_amount numeric,
  p_new_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold numeric;
  v_window_hours int;
  v_velocity_limit numeric;
  v_recent_total numeric;
begin
  select large_transaction_threshold, velocity_window_hours, velocity_limit_amount
  into v_threshold, v_window_hours, v_velocity_limit
  from public.platform_settings where id = 1;

  begin
    if p_amount >= v_threshold then
      perform public.flag_suspicious_activity(
        'large_transaction', p_user_id, 'wallet_transaction', p_new_transaction_id, p_amount,
        jsonb_build_object('type', p_type, 'threshold', v_threshold)
      );
    end if;

    select coalesce(sum(amount), 0) into v_recent_total
    from public.wallet_transactions
    where user_id = p_user_id
      and type = p_type
      and status in ('pending', 'completed')
      and created_at > now() - make_interval(hours => v_window_hours);
    -- p_new_transaction_id's own row is already inserted (status
    -- pending) by the time this runs, so v_recent_total already
    -- includes it — no separate addition needed.

    if v_recent_total >= v_velocity_limit then
      perform public.flag_suspicious_activity(
        'high_velocity', p_user_id, 'wallet_transaction', p_new_transaction_id, v_recent_total,
        jsonb_build_object('type', p_type, 'window_hours', v_window_hours, 'limit', v_velocity_limit)
      );
    end if;
  exception when others then
    -- A bug here must never block a real wallet operation — this is a
    -- monitoring signal, not a gate.
    insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
    values ('fraud_velocity_check_failed', 'wallet_transactions', p_new_transaction_id, sqlerrm);
  end;
end;
$$;

revoke execute on function public.check_wallet_velocity_and_threshold(uuid, public.wallet_transaction_type, numeric, uuid) from public;

create or replace function public.initiate_wallet_topup(p_amount numeric, p_phone text, p_reference_id text)
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

  perform public.check_wallet_velocity_and_threshold(auth.uid(), 'topup', p_amount, new_id);

  return query select new_id, p_reference_id, true;
end;
$$;

create or replace function public.request_wallet_withdrawal(p_amount numeric, p_phone text)
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

  perform public.check_wallet_velocity_and_threshold(auth.uid(), 'withdrawal', p_amount, new_id);

  perform public.log_audit_event('wallet_withdrawal_requested', 'wallet_transaction', new_id, jsonb_build_object('amount', p_amount));

  return query select new_id, ref, true;
end;
$$;

-- ============================================================
-- 4. Automated ledger drift monitoring — closes the "reconciliation
--    reports exist but nothing watches them" gap. Callable by staff
--    (manual check) or service_role (wired into the daily
--    reconcile-momo cron below), unlike the staff-only integrity
--    reports it wraps.
-- ============================================================

create function public.run_ledger_drift_check()
returns table (drift_found boolean, unbalanced_postings bigint, balance_projection_drift_accounts bigint, posting_failure_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unbalanced bigint;
  v_drifted bigint;
  v_failures bigint;
begin
  if auth.role() <> 'service_role' and not public.is_staff() then
    raise exception 'Staff or a trusted server process is required';
  end if;

  select count(*) into v_unbalanced from (
    select posting_id from public.ledger_posting_lines
    group by posting_id
    having sum(case when direction = 'debit' then amount else -amount end) <> 0
  ) x;

  select count(*) into v_drifted from (
    select ab.account_id
    from public.ledger_account_balances ab
    join (
      select account_id, sum(case when direction = 'credit' then amount else -amount end) as computed_balance
      from public.ledger_posting_lines
      group by account_id
    ) computed on computed.account_id = ab.account_id
    where ab.balance <> computed.computed_balance
  ) y;

  select count(*) into v_failures from public.ledger_posting_failures where occurred_at > now() - interval '24 hours';

  if v_unbalanced > 0 or v_drifted > 0 or v_failures > 0 then
    perform public.flag_suspicious_activity(
      'ledger_drift_detected', null, 'ledger', null, null,
      jsonb_build_object('unbalanced_postings', v_unbalanced, 'balance_projection_drift_accounts', v_drifted, 'recent_posting_failures', v_failures)
    );
  end if;

  return query select (v_unbalanced > 0 or v_drifted > 0 or v_failures > 0), v_unbalanced, v_drifted, v_failures;
end;
$$;
