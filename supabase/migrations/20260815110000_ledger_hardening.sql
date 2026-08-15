-- Step 3 of the post-Phase-10 fintech hardening sequence (idempotency →
-- webhooks → this). Not a redesign of the money model — the existing
-- tables, RPCs, and statuses are untouched. This adds:
--   1. An append-only ledger_events audit trail, captured automatically
--      by a generic trigger so it can never fall out of sync with a
--      hand-written log call inside some RPC.
--   2. A DB-level non-negative wallet balance invariant — the balance
--      formula already lived only in get_wallet_balance()'s SQL; this
--      makes it impossible for *any* write path, present or future, to
--      leave a user with a negative spendable balance.
--   3. Amount-immutability triggers on the four core money tables —
--      confirmed by grepping every existing migration first that no
--      legitimate code path ever mutates these amount columns after
--      creation (missed_fine_amount is a distinct column).
--   4. A staff-facing ledger integrity report RPC, surfaced as a new
--      card on the existing /internal/custody page.

-- ============================================================
-- 1. Append-only ledger_events audit trail
-- ============================================================

create table public.ledger_events (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  operation text not null,
  status text,
  amount numeric(12, 2),
  actor_user_id uuid,
  occurred_at timestamptz not null default now(),
  row_snapshot jsonb not null
);

create index ledger_events_table_row_idx on public.ledger_events (table_name, row_id);
create index ledger_events_occurred_at_idx on public.ledger_events (occurred_at desc);

alter table public.ledger_events enable row level security;
-- No policies at all: not even service_role gets an insert/update/delete
-- policy, because writes only ever happen through the trigger function
-- below (SECURITY DEFINER, owned by the migration role, bypasses RLS by
-- virtue of being invoked as a trigger on the table owner's behalf).
-- Staff read it only through list_ledger_events()/get_ledger_integrity_report()
-- further down, same "controlled read function" pattern as every other
-- internal-console table since Phase 9.

-- Belt-and-suspenders: block UPDATE/DELETE outright at the table level
-- so even a future service-role script can't quietly edit history.
create function public.forbid_ledger_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger_events is append-only — % is not permitted', tg_op;
end;
$$;

create trigger ledger_events_no_update
  before update on public.ledger_events
  for each row execute function public.forbid_ledger_event_mutation();

create trigger ledger_events_no_delete
  before delete on public.ledger_events
  for each row execute function public.forbid_ledger_event_mutation();

-- Generic capture trigger, schema-agnostic via to_jsonb() extraction so
-- one function serves every target table regardless of which of them
-- has a status/amount column (payout_approvals has neither).
create function public.capture_ledger_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_row_id uuid;
begin
  v_row := to_jsonb(new);
  v_row_id := (v_row ->> 'id')::uuid;

  insert into public.ledger_events (table_name, row_id, operation, status, amount, actor_user_id, row_snapshot)
  values (
    tg_table_name,
    v_row_id,
    tg_op,
    v_row ->> 'status',
    nullif(v_row ->> 'amount', '')::numeric,
    auth.uid(),
    v_row
  );

  return new;
end;
$$;

create trigger contributions_ledger_event
  after insert or update on public.contributions
  for each row execute function public.capture_ledger_event();

create trigger payout_requests_ledger_event
  after insert or update on public.payout_requests
  for each row execute function public.capture_ledger_event();

create trigger payout_approvals_ledger_event
  after insert on public.payout_approvals
  for each row execute function public.capture_ledger_event();

create trigger wallet_transactions_ledger_event
  after insert or update on public.wallet_transactions
  for each row execute function public.capture_ledger_event();

create trigger custody_ledger_ledger_event
  after insert or update on public.custody_ledger
  for each row execute function public.capture_ledger_event();

-- ============================================================
-- 2. DB-level wallet balance non-negative invariant
-- ============================================================

-- Mirrors get_wallet_balance()'s exact formula (topup+completed,
-- payout_credit+completed, withdrawal in completed/pending as negative)
-- but computed on demand from every OTHER row for this user, so it
-- catches a violation regardless of which function or future code path
-- performed the write.
create function public.enforce_wallet_balance_non_negative()
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
    else 0
  end;

  if v_balance < 0 then
    raise exception 'This wallet transaction would leave user % with a negative balance (%)', v_user, v_balance;
  end if;

  return new;
end;
$$;

create trigger wallet_transactions_balance_invariant
  before insert or update on public.wallet_transactions
  for each row execute function public.enforce_wallet_balance_non_negative();

-- ============================================================
-- 3. Amount immutability on the four core money tables
-- ============================================================

create function public.forbid_amount_change()
returns trigger
language plpgsql
as $$
begin
  if new.amount is distinct from old.amount then
    raise exception '% is append-only for amount — cannot change % from % to %', tg_table_name, old.id, old.amount, new.amount;
  end if;
  return new;
end;
$$;

create trigger contributions_amount_immutable
  before update on public.contributions
  for each row execute function public.forbid_amount_change();

create trigger payout_requests_amount_immutable
  before update on public.payout_requests
  for each row execute function public.forbid_amount_change();

create trigger wallet_transactions_amount_immutable
  before update on public.wallet_transactions
  for each row execute function public.forbid_amount_change();

create trigger custody_ledger_amount_immutable
  before update on public.custody_ledger
  for each row execute function public.forbid_amount_change();

-- ============================================================
-- 4. Staff-facing ledger integrity report
-- ============================================================

create function public.get_ledger_integrity_report()
returns table (
  wallet_balance_check_ok boolean,
  negative_balance_user_count bigint,
  orphaned_completed_payouts_without_sweep bigint,
  contributions_confirmed_without_transaction_id bigint,
  payouts_completed_without_transaction_id bigint,
  total_ledger_events bigint,
  latest_ledger_event_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select
    (select count(*) from (
      select user_id, coalesce(sum(
        case
          when type = 'topup' and status = 'completed' then amount
          when type = 'payout_credit' and status = 'completed' then amount
          when type = 'withdrawal' and status in ('completed', 'pending') then -amount
          else 0
        end
      ), 0) as bal
      from public.wallet_transactions
      where user_id is not null
      group by user_id
      having coalesce(sum(
        case
          when type = 'topup' and status = 'completed' then amount
          when type = 'payout_credit' and status = 'completed' then amount
          when type = 'withdrawal' and status in ('completed', 'pending') then -amount
          else 0
        end
      ), 0) < 0
    ) neg) = 0,
    (select count(*) from (
      select user_id
      from public.wallet_transactions
      where user_id is not null
      group by user_id
      having coalesce(sum(
        case
          when type = 'topup' and status = 'completed' then amount
          when type = 'payout_credit' and status = 'completed' then amount
          when type = 'withdrawal' and status in ('completed', 'pending') then -amount
          else 0
        end
      ), 0) < 0
    ) neg2),
    (select count(*) from public.payout_requests pr
      join public.groups g on g.id = pr.group_id
      where pr.status = 'completed' and g.account_type = 'uzuza_held' and pr.swept_at is null),
    (select count(*) from public.contributions where status in ('confirmed', 'paid_late') and transaction_id is null),
    (select count(*) from public.payout_requests where status = 'completed' and transaction_id is null),
    (select count(*) from public.ledger_events),
    (select max(occurred_at) from public.ledger_events);
end;
$$;
