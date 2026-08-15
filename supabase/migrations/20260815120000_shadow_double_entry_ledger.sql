-- Stage A of the double-entry/event-sourced ledger redesign (see
-- docs/ledger-redesign-analysis.md — user approved Stage A only after
-- reviewing that design doc). This is a SHADOW ledger: it is wired to
-- write alongside every real money-moving path, but nothing in the
-- application reads from it yet. No existing table, RPC signature, or
-- user-facing behaviour changes. Stage B (backfill), Stage C (switching
-- real read paths over), and Stage D (demoting legacy columns) are
-- explicitly out of scope here.
--
-- Design recap (see the doc for full reasoning):
--   - Accounts: one user_wallet per user, one group_custody and one
--     group_safety_fund per group, plus two singleton external accounts
--     (external_momo_collections / external_momo_disbursements)
--     representing money crossing the system boundary.
--   - No separate "reservation escrow" account — verified against the
--     real confirm_reservation() code that a confirmed reservation's fee
--     is inserted straight into custody_ledger (the same table a
--     confirmed contribution uses), so reservations and contributions
--     already share one real custody pool; inventing a separate escrow
--     account would misrepresent actual behaviour.
--   - Postings are captured automatically via triggers wherever a
--     dedicated event-representing table already exists (custody_ledger,
--     wallet_transactions) — zero RPC changes needed for those flows,
--     and it uniformly covers RPC writes, webhook writes, and
--     reconciliation-cron writes alike, since all of them write to the
--     same underlying tables.
--   - The one place with no dedicated event table is
--     groups.safety_fund_balance, a directly-mutated column with no
--     history today. That requires touching the 4 RPCs that mutate it
--     (confirm_contribution, momo_confirm_contribution,
--     report_missed_payment, confirm_late_payment) to add one explicit
--     posting call each, at the exact point they already mutate the
--     column. No other logic in those functions changes.

-- ============================================================
-- 1. Accounts
-- ============================================================

create type public.ledger_account_type as enum (
  'user_wallet',
  'group_custody',
  'group_safety_fund',
  'external_momo_collections',
  'external_momo_disbursements'
);

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type public.ledger_account_type not null,
  owner_user_id uuid references auth.users (id),
  owner_group_id uuid references public.groups (id),
  natural_key text not null,
  created_at timestamptz not null default now(),
  constraint ledger_accounts_owner_shape check (
    (account_type = 'user_wallet' and owner_user_id is not null and owner_group_id is null)
    or (account_type in ('group_custody', 'group_safety_fund') and owner_group_id is not null and owner_user_id is null)
    or (account_type in ('external_momo_collections', 'external_momo_disbursements') and owner_user_id is null and owner_group_id is null)
  )
);

create unique index ledger_accounts_natural_key_uniq on public.ledger_accounts (natural_key);

alter table public.ledger_accounts enable row level security;
-- No policies at all, for anyone, including staff — this is a shadow
-- table. It's written only via get_or_create_ledger_account() (called
-- from SECURITY DEFINER context) and read only via the staff-gated
-- integrity report function further down.

-- ============================================================
-- 2. Postings (the append-only source of truth) + balance projection
-- ============================================================

create table public.ledger_postings (
  id uuid primary key default gen_random_uuid(),
  source_event text not null,
  source_table text not null,
  source_id uuid not null,
  memo text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index ledger_postings_source_idx on public.ledger_postings (source_table, source_id);

create table public.ledger_posting_lines (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.ledger_postings (id),
  account_id uuid not null references public.ledger_accounts (id),
  direction text not null check (direction in ('debit', 'credit')),
  amount numeric(14, 2) not null check (amount > 0)
);

create index ledger_posting_lines_posting_idx on public.ledger_posting_lines (posting_id);
create index ledger_posting_lines_account_idx on public.ledger_posting_lines (account_id);

alter table public.ledger_postings enable row level security;
alter table public.ledger_posting_lines enable row level security;
-- Same as ledger_accounts — no policies, shadow-only, read via the
-- staff-gated report function.

-- account_balances is a maintained projection (sum of posting_lines per
-- account), kept transactionally in sync by post_ledger_entry() so reads
-- (once anything is allowed to read, in a later stage) don't need to
-- re-sum the full history every time. It is legitimately mutable — this
-- is the one new table that is NOT append-only by design.
create table public.ledger_account_balances (
  account_id uuid primary key references public.ledger_accounts (id),
  balance numeric(14, 2) not null default 0,
  last_posting_id uuid references public.ledger_postings (id),
  updated_at timestamptz not null default now()
);

alter table public.ledger_account_balances enable row level security;

-- Append-only enforcement on the three genuinely-immutable tables,
-- mirroring the exact pattern already proven for ledger_events in
-- 20260815110000_ledger_hardening.sql.
create function public.forbid_ledger_table_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only — % is not permitted', tg_table_name, tg_op;
end;
$$;

create trigger ledger_accounts_no_update before update on public.ledger_accounts
  for each row execute function public.forbid_ledger_table_mutation();
create trigger ledger_accounts_no_delete before delete on public.ledger_accounts
  for each row execute function public.forbid_ledger_table_mutation();
create trigger ledger_postings_no_update before update on public.ledger_postings
  for each row execute function public.forbid_ledger_table_mutation();
create trigger ledger_postings_no_delete before delete on public.ledger_postings
  for each row execute function public.forbid_ledger_table_mutation();
create trigger ledger_posting_lines_no_update before update on public.ledger_posting_lines
  for each row execute function public.forbid_ledger_table_mutation();
create trigger ledger_posting_lines_no_delete before delete on public.ledger_posting_lines
  for each row execute function public.forbid_ledger_table_mutation();

-- ============================================================
-- 3. Failure isolation — a shadow-ledger bug must NEVER block a real
--    money-moving transaction. Verified there is no amount > 0 check
--    constraint on contributions.amount, reservations.fee_amount, or
--    custody_ledger.amount today, so post_ledger_entry's own validation
--    could in principle reject an edge-case value that the real app
--    would otherwise have accepted. Every call site below is wrapped in
--    an exception handler that logs here and continues, rather than
--    letting a shadow-ledger problem propagate into the caller's
--    transaction.
-- ============================================================

create table public.ledger_posting_failures (
  id uuid primary key default gen_random_uuid(),
  source_event text not null,
  source_table text not null,
  source_id uuid,
  error_message text not null,
  occurred_at timestamptz not null default now()
);

alter table public.ledger_posting_failures enable row level security;

-- ============================================================
-- 4. Core write functions
-- ============================================================

create function public.get_or_create_ledger_account(
  p_account_type public.ledger_account_type,
  p_owner_user_id uuid default null,
  p_owner_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_id uuid;
begin
  v_key := case p_account_type
    when 'user_wallet' then 'user_wallet:' || p_owner_user_id::text
    when 'group_custody' then 'group_custody:' || p_owner_group_id::text
    when 'group_safety_fund' then 'group_safety_fund:' || p_owner_group_id::text
    else p_account_type::text
  end;

  select id into v_id from public.ledger_accounts where natural_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.ledger_accounts (account_type, owner_user_id, owner_group_id, natural_key)
  values (p_account_type, p_owner_user_id, p_owner_group_id, v_key)
  on conflict (natural_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.ledger_accounts where natural_key = v_key;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.get_or_create_ledger_account(public.ledger_account_type, uuid, uuid) from public;

-- p_lines: jsonb array of {account_type, owner_user_id?, owner_group_id?, direction, amount}.
-- Validates the posting balances (sum of debits = sum of credits) before
-- writing anything, inserts the posting + its lines, and updates the
-- balance projection for every account touched, all in the caller's
-- transaction (so it lives or dies with whatever real business action
-- triggered it).
create function public.post_ledger_entry(
  p_source_event text,
  p_source_table text,
  p_source_id uuid,
  p_memo text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_posting_id uuid;
  v_line jsonb;
  v_account_id uuid;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_direction text;
  v_amount numeric;
  v_delta numeric;
begin
  if p_lines is null or jsonb_array_length(p_lines) < 2 then
    raise exception 'post_ledger_entry requires at least two lines (got %)', coalesce(jsonb_array_length(p_lines), 0);
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_direction := v_line ->> 'direction';
    v_amount := (v_line ->> 'amount')::numeric;
    if v_direction not in ('debit', 'credit') then
      raise exception 'invalid posting line direction: %', v_direction;
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'invalid posting line amount: %', v_amount;
    end if;
    if v_direction = 'debit' then
      v_total_debit := v_total_debit + v_amount;
    else
      v_total_credit := v_total_credit + v_amount;
    end if;
  end loop;

  if v_total_debit <> v_total_credit then
    raise exception 'unbalanced ledger posting: debits % <> credits % (source_event=%)', v_total_debit, v_total_credit, p_source_event;
  end if;

  insert into public.ledger_postings (source_event, source_table, source_id, memo, created_by)
  values (p_source_event, p_source_table, p_source_id, p_memo, auth.uid())
  returning id into v_posting_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_account_id := public.get_or_create_ledger_account(
      (v_line ->> 'account_type')::public.ledger_account_type,
      nullif(v_line ->> 'owner_user_id', '')::uuid,
      nullif(v_line ->> 'owner_group_id', '')::uuid
    );
    v_direction := v_line ->> 'direction';
    v_amount := (v_line ->> 'amount')::numeric;

    insert into public.ledger_posting_lines (posting_id, account_id, direction, amount)
    values (v_posting_id, v_account_id, v_direction, v_amount);

    v_delta := case when v_direction = 'credit' then v_amount else -v_amount end;

    insert into public.ledger_account_balances (account_id, balance, last_posting_id)
    values (v_account_id, v_delta, v_posting_id)
    on conflict (account_id) do update
      set balance = public.ledger_account_balances.balance + excluded.balance,
          last_posting_id = v_posting_id,
          updated_at = now();
  end loop;

  return v_posting_id;
end;
$$;

revoke execute on function public.post_ledger_entry(text, text, uuid, text, jsonb) from public;

-- ============================================================
-- 5. Automatic capture triggers — zero RPC changes for custody inflows
--    and every wallet_transactions event (topup, withdrawal, payout
--    credit), because these already funnel through one real table each
--    regardless of whether the write came from an RPC, a webhook route,
--    or the reconciliation cron.
-- ============================================================

create function public.capture_custody_inflow_posting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.post_ledger_entry(
      'custody_inflow', 'custody_ledger', new.id,
      case when new.reservation_id is not null
        then 'Reservation fee held in Uzuza custody'
        else 'Contribution held in Uzuza custody'
      end,
      jsonb_build_array(
        jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', new.amount),
        jsonb_build_object('account_type', 'group_custody', 'owner_group_id', new.group_id, 'direction', 'credit', 'amount', new.amount)
      )
    );
  exception when others then
    insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
    values ('custody_inflow', 'custody_ledger', new.id, sqlerrm);
  end;
  return new;
end;
$$;

create trigger custody_ledger_posting
  after insert on public.custody_ledger
  for each row execute function public.capture_custody_inflow_posting();

-- Covers three distinct real events on one table:
--   - a withdrawal row is inserted (always status='pending') — reserves
--     the amount out of the wallet immediately, matching
--     get_wallet_balance()'s own formula, which already treats
--     'pending' withdrawals as spent.
--   - a topup row transitions to status='completed' — credits the
--     wallet (topups are only ever counted once 'completed', never
--     'pending', per the same balance formula).
--   - a withdrawal row transitions from 'pending' to 'failed' — reverses
--     the earlier reservation, since a failed withdrawal is no longer
--     counted against the balance.
--   - a payout_credit row is inserted (always status='completed',
--     inserted exactly once by sweep_uzuza_held_payout_to_wallet) —
--     moves the amount from the group's custody into the recipient's
--     wallet.
create function public.capture_wallet_transaction_posting()
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

create trigger wallet_transactions_posting
  after insert or update on public.wallet_transactions
  for each row execute function public.capture_wallet_transaction_posting();

-- ============================================================
-- 6. Safety fund — the one case with no dedicated event table, so the
--    4 RPCs that mutate groups.safety_fund_balance are redefined
--    (identical signatures, identical existing logic) to also emit a
--    posting at the exact point they already touch that column. Only
--    for uzuza_held groups — verified group_owned groups also skim
--    safety_fund_balance today even though Uzuza holds none of that
--    group's real money (confirmed: the skim in confirm_contribution is
--    gated only on safety_fund_type = 'buffer', not on account_type at
--    all), so posting a group_custody-side entry for a group_owned
--    group would fabricate money Uzuza never actually held. For
--    group_owned groups, safety_fund_balance stays exactly as
--    untracked by the shadow ledger as that group's contributions and
--    payouts already are — a deliberate, disclosed scope boundary, not
--    an oversight.
-- ============================================================

create or replace function public.confirm_contribution(p_contribution_id uuid, p_approve boolean, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  target_group_name text;
  is_admin boolean;
  remaining_unconfirmed int;
  g_account_type public.account_type;
  g_safety_fund_type public.safety_fund_type;
  g_base_amount numeric;
  member_contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  select group_id, cycle_id, amount, member_id
  into target_group_id, target_cycle_id, member_contribution_amount, target_member_id
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

  select account_type, safety_fund_type, contribution_amount, name
  into g_account_type, g_safety_fund_type, g_base_amount, target_group_name
  from public.groups where id = target_group_id;

  if p_approve and g_account_type = 'uzuza_held' then
    perform public.require_fund_release_mfa();

    perform pg_advisory_xact_lock(hashtext('uzuza_custody_cap'));
  select public.get_total_uzuza_held() into currently_held;
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

    if g_account_type = 'uzuza_held' then
      begin
        perform public.post_ledger_entry(
          'safety_fund_buffer_skim', 'groups', target_group_id, 'Buffer skim reallocated from custody to safety fund',
          jsonb_build_array(
            jsonb_build_object('account_type', 'group_custody', 'owner_group_id', target_group_id, 'direction', 'debit', 'amount', g_base_amount * 0.075),
            jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', g_base_amount * 0.075)
          )
        );
      exception when others then
        insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
        values ('safety_fund_buffer_skim', 'groups', target_group_id, sqlerrm);
      end;
    end if;
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;
end;
$function$;

create or replace function public.momo_confirm_contribution(p_contribution_id uuid, p_reference_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  target_group_name text;
  remaining_unconfirmed int;
  g_account_type public.account_type;
  g_safety_fund_type public.safety_fund_type;
  g_base_amount numeric;
  member_contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  select group_id, cycle_id, amount, member_id
  into target_group_id, target_cycle_id, member_contribution_amount, target_member_id
  from public.contributions
  where id = p_contribution_id
    and payment_channel = 'momo_collections'
    and collection_reference_id = p_reference_id
    and status = 'submitted';

  if target_group_id is null then
    raise exception 'Contribution not found, not a MoMo Collections payment, or not awaiting confirmation';
  end if;

  select account_type, safety_fund_type, contribution_amount, name
  into g_account_type, g_safety_fund_type, g_base_amount, target_group_name
  from public.groups where id = target_group_id;

  if g_account_type = 'uzuza_held' then
    perform pg_advisory_xact_lock(hashtext('uzuza_custody_cap'));
  select public.get_total_uzuza_held() into currently_held;
    select custody_cap_amount into cap from public.platform_settings where id = 1;

    if currently_held + member_contribution_amount > cap then
      raise exception 'Platform custody cap reached — cannot hold this contribution right now';
    end if;
  end if;

  update public.contributions
  set status = 'confirmed', confirmed_at = now()
  where id = p_contribution_id and status = 'submitted';

  if not found then
    raise exception 'Contribution not found or not awaiting confirmation';
  end if;

  if g_account_type = 'uzuza_held' then
    insert into public.custody_ledger (group_id, contribution_id, amount)
    values (target_group_id, p_contribution_id, member_contribution_amount);

    perform public.log_audit_event('contribution_confirmed_custody', 'contribution', p_contribution_id, jsonb_build_object('amount', member_contribution_amount, 'group_id', target_group_id, 'via', 'momo_collections'));
  end if;

  if g_safety_fund_type = 'buffer' then
    update public.groups
    set safety_fund_balance = safety_fund_balance + (g_base_amount * 0.075)
    where id = target_group_id;

    if g_account_type = 'uzuza_held' then
      begin
        perform public.post_ledger_entry(
          'safety_fund_buffer_skim', 'groups', target_group_id, 'Buffer skim reallocated from custody to safety fund',
          jsonb_build_array(
            jsonb_build_object('account_type', 'group_custody', 'owner_group_id', target_group_id, 'direction', 'debit', 'amount', g_base_amount * 0.075),
            jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', g_base_amount * 0.075)
          )
        );
      exception when others then
        insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
        values ('safety_fund_buffer_skim', 'groups', target_group_id, sqlerrm);
      end;
    end if;
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;

  perform public.create_notification(
    target_member_id, 'Payment confirmed',
    'Your ' || member_contribution_amount::text || ' RWF contribution to ' || target_group_name || ' was confirmed via MTN MoMo.',
    '/groups/' || target_group_id
  );
end;
$$;

create or replace function public.report_missed_payment(p_contribution_id uuid, p_fine_amount numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  target_group_name text;
  is_admin boolean;
  recipient_paid boolean;
  fund_type public.safety_fund_type;
  fund_balance numeric;
  g_account_type public.account_type;
  remaining_unconfirmed int;
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
    select safety_fund_type, safety_fund_balance, account_type into fund_type, fund_balance, g_account_type
    from public.groups where id = target_group_id;

    if fund_type != 'off' and fund_balance >= p_fine_amount then
      update public.groups
      set safety_fund_balance = safety_fund_balance - p_fine_amount
      where id = target_group_id;

      if g_account_type = 'uzuza_held' then
        begin
          perform public.post_ledger_entry(
            'safety_fund_draw', 'groups', target_group_id, 'Safety fund absorbed a missed-payment shortfall',
            jsonb_build_array(
              jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'debit', 'amount', p_fine_amount),
              jsonb_build_object('account_type', 'group_custody', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', p_fine_amount)
            )
          );
        exception when others then
          insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
          values ('safety_fund_draw', 'groups', target_group_id, sqlerrm);
        end;
      end if;
    end if;
    -- If the fund can't cover it, the contribution stays 'missed' with no
    -- further automatic action — Section 3.7 calls for an explicit group
    -- decision at that point, not a silent write.
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;

  perform public.log_audit_event('missed_payment_reported', 'contribution', p_contribution_id, jsonb_build_object('fine_amount', p_fine_amount, 'recipient_paid', recipient_paid));

  select name into target_group_name from public.groups where id = target_group_id;
  perform public.create_notification(
    target_member_id, 'Missed payment reported',
    'A ' || p_fine_amount::text || ' RWF fine was added in ' || target_group_name || '. You can pay late to stay in good standing.',
    '/groups/' || target_group_id
  );
end;
$function$;

create or replace function public.confirm_late_payment(p_contribution_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  is_admin boolean;
  owed_amount numeric;
  fine_amount numeric;
  g_account_type public.account_type;
begin
  select group_id, amount, coalesce(missed_fine_amount, 0)
  into target_group_id, owed_amount, fine_amount
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a late payment';
  end if;

  if p_approve then
    update public.contributions
    set status = 'paid_late', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;

    update public.groups
    set safety_fund_balance = safety_fund_balance + owed_amount + fine_amount
    where id = target_group_id;

    select account_type into g_account_type from public.groups where id = target_group_id;
    if g_account_type = 'uzuza_held' then
      begin
        perform public.post_ledger_entry(
          'safety_fund_late_payment_credit', 'groups', target_group_id, 'Late payment credited to safety fund',
          jsonb_build_array(
            jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', owed_amount + fine_amount),
            jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', owed_amount + fine_amount)
          )
        );
      exception when others then
        insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
        values ('safety_fund_late_payment_credit', 'groups', target_group_id, sqlerrm);
      end;
    end if;

    perform public.log_audit_event('late_payment_confirmed', 'contribution', p_contribution_id, jsonb_build_object('amount', owed_amount, 'fine_amount', fine_amount));
  else
    update public.contributions
    set status = 'missed',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;
  end if;
end;
$$;

-- ============================================================
-- 7. Verification — staff-gated, not surfaced in any UI yet (the shadow
--    ledger is write-only per the Stage A brief; this exists purely so
--    the ledger's own correctness can be checked, via direct RPC call
--    or a script, same access pattern as get_ledger_integrity_report()).
-- ============================================================

create function public.get_shadow_ledger_integrity_report()
returns table (
  total_postings bigint,
  total_lines bigint,
  unbalanced_postings bigint,
  balance_projection_drift_accounts bigint,
  global_debit_total numeric,
  global_credit_total numeric,
  custody_ledger_rows_missing_posting bigint,
  wallet_topup_completed_missing_posting bigint,
  wallet_payout_credit_missing_posting bigint,
  wallet_withdrawal_missing_posting bigint,
  posting_failure_count bigint,
  latest_posting_at timestamptz
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
    (select count(*) from public.ledger_postings),
    (select count(*) from public.ledger_posting_lines),
    (select count(*) from (
      select posting_id
      from public.ledger_posting_lines
      group by posting_id
      having sum(case when direction = 'debit' then amount else -amount end) <> 0
    ) unbalanced),
    (select count(*) from (
      select ab.account_id
      from public.ledger_account_balances ab
      join (
        select account_id, sum(case when direction = 'credit' then amount else -amount end) as computed_balance
        from public.ledger_posting_lines
        group by account_id
      ) computed on computed.account_id = ab.account_id
      where ab.balance <> computed.computed_balance
    ) drifted),
    (select coalesce(sum(amount), 0) from public.ledger_posting_lines where direction = 'debit'),
    (select coalesce(sum(amount), 0) from public.ledger_posting_lines where direction = 'credit'),
    (select count(*) from public.custody_ledger cl
      where not exists (select 1 from public.ledger_postings lp where lp.source_table = 'custody_ledger' and lp.source_id = cl.id)),
    (select count(*) from public.wallet_transactions wt
      where wt.type = 'topup' and wt.status = 'completed'
        and not exists (select 1 from public.ledger_postings lp where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id and lp.source_event = 'wallet_topup_completed')),
    (select count(*) from public.wallet_transactions wt
      where wt.type = 'payout_credit' and wt.status = 'completed'
        and not exists (select 1 from public.ledger_postings lp where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id and lp.source_event = 'payout_swept_to_wallet')),
    (select count(*) from public.wallet_transactions wt
      where wt.type = 'withdrawal'
        and not exists (select 1 from public.ledger_postings lp where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id and lp.source_event = 'wallet_withdrawal_reserved')),
    (select count(*) from public.ledger_posting_failures),
    (select max(created_at) from public.ledger_postings);
end;
$$;
