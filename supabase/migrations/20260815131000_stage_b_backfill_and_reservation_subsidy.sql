-- Stage B (backfill) + the reservation -> first-contribution gap fix,
-- chosen option: "make the accounting correct and auditable without
-- changing member experience" (Option 2 from the Stage A report). A
-- reservation-linked first contribution keeps being marked confirmed
-- for its full amount exactly as today — nothing changes for members —
-- but the shadow ledger now posts the shortfall (full amount minus the
-- reservation fee actually collected) from a new, clearly-labeled
-- platform_adjustment account instead of silently under-counting
-- group_custody. This is live going forward (the new trigger below) and
-- backfilled for the one piece of it that already existed historically.
--
-- Everything else in this file is the one-time Stage B backfill: every
-- pre-existing custody_ledger/wallet_transactions/paid_late row gets a
-- posting exactly matching what the live Stage A triggers would have
-- produced had they existed at the time. The one place that CANNOT be
-- exactly reconstructed is the safety fund's historical component
-- transactions (individual buffer skims and missed-payment draws were
-- never logged anywhere before Stage A — only the final
-- groups.safety_fund_balance column survived) — for that, a single
-- "opening balance" plug posting per group is inserted for whatever
-- portion isn't otherwise reconstructable, explicitly tagged and
-- explained as an approximation, never presented as exact.
--
-- The whole backfill is idempotent (every step checks for an existing
-- posting before acting) so it's safe to re-run this function if ever
-- needed.

-- ============================================================
-- 1. Widen the account shape check to allow platform_adjustment
-- ============================================================

alter table public.ledger_accounts drop constraint if exists ledger_accounts_owner_shape;
alter table public.ledger_accounts add constraint ledger_accounts_owner_shape check (
  (account_type = 'user_wallet' and owner_group_id is null)
  or (account_type in ('group_custody', 'group_safety_fund') and owner_user_id is null)
  or (account_type in ('external_momo_collections', 'external_momo_disbursements', 'platform_adjustment') and owner_user_id is null and owner_group_id is null)
);

-- ============================================================
-- 2. Live trigger: reservation -> first-contribution conversion
-- ============================================================

-- Fires only on the one real code path that creates an already-
-- confirmed, reservation-linked contribution: start_cycle's direct
-- insert for a member whose reservation was already confirmed
-- (verified against the live start_cycle() body — this is the only
-- place reservation_id is ever set on a contributions row, and it is
-- always inserted pre-confirmed, never reaches this state via an
-- UPDATE). Fires regardless of the group's account_type, matching the
-- business rule that a reservation deposit is always Uzuza-held
-- (CLAUDE.md Section 3.5) independent of the group's later choice for
-- ongoing contributions — the reservation's own custody_ledger row is
-- already posted unconditionally by the Stage A custody_ledger trigger
-- for exactly this reason.
create function public.capture_reservation_conversion_subsidy_posting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
  v_shortfall numeric;
begin
  if new.reservation_id is null then
    return new;
  end if;

  select fee_amount into v_fee from public.reservations where id = new.reservation_id;
  if v_fee is null then
    return new;
  end if;

  v_shortfall := new.amount - v_fee;
  if v_shortfall <= 0 then
    return new;
  end if;

  begin
    perform public.post_ledger_entry(
      'reservation_conversion_subsidy', 'contributions', new.id,
      'Reservation fee (' || v_fee::text || ') only covered part of the first contribution (' || new.amount::text ||
        ') — shortfall subsidized so the group''s custody balance matches what the contribution record claims was received',
      jsonb_build_array(
        jsonb_build_object('account_type', 'platform_adjustment', 'direction', 'debit', 'amount', v_shortfall),
        jsonb_build_object('account_type', 'group_custody', 'owner_group_id', new.group_id, 'direction', 'credit', 'amount', v_shortfall)
      )
    );
  exception when others then
    insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
    values ('reservation_conversion_subsidy', 'contributions', new.id, sqlerrm);
  end;

  return new;
end;
$$;

create trigger contributions_reservation_conversion_posting
  after insert on public.contributions
  for each row execute function public.capture_reservation_conversion_subsidy_posting();

-- ============================================================
-- 3. One-time backfill function (idempotent — safe to re-run)
-- ============================================================

create function public.run_stage_b_backfill()
returns table (category text, rows_posted int, rows_skipped int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_posted int;
  v_skipped int;
  v_residual numeric;
begin
  -- (a) custody_ledger rows with no posting yet.
  v_posted := 0; v_skipped := 0;
  for r in
    select cl.* from public.custody_ledger cl
    where not exists (select 1 from public.ledger_postings lp where lp.source_table = 'custody_ledger' and lp.source_id = cl.id)
  loop
    begin
      perform public.post_ledger_entry(
        'custody_inflow_backfill', 'custody_ledger', r.id,
        'Backfilled (Stage B) — this row predates the live custody_ledger trigger',
        jsonb_build_array(
          jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', r.amount),
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', r.group_id, 'direction', 'credit', 'amount', r.amount)
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('custody_inflow_backfill', 'custody_ledger', r.id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'custody_ledger'::text, v_posted, v_skipped;

  -- (b) wallet_transactions: completed topups with no posting.
  v_posted := 0; v_skipped := 0;
  for r in
    select wt.* from public.wallet_transactions wt
    where wt.type = 'topup' and wt.status = 'completed' and wt.user_id is not null
      and not exists (
        select 1 from public.ledger_postings lp
        where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id
          and lp.source_event in ('wallet_topup_completed', 'wallet_topup_completed_backfill')
      )
  loop
    begin
      perform public.post_ledger_entry(
        'wallet_topup_completed_backfill', 'wallet_transactions', r.id, 'Backfilled (Stage B)',
        jsonb_build_array(
          jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', r.amount),
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', r.user_id, 'direction', 'credit', 'amount', r.amount)
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('wallet_topup_completed_backfill', 'wallet_transactions', r.id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'wallet_transactions.topup'::text, v_posted, v_skipped;

  -- (c) wallet_transactions: completed payout_credit rows with no posting.
  v_posted := 0; v_skipped := 0;
  for r in
    select wt.* from public.wallet_transactions wt
    where wt.type = 'payout_credit' and wt.status = 'completed' and wt.user_id is not null and wt.source_group_id is not null
      and not exists (
        select 1 from public.ledger_postings lp
        where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id
          and lp.source_event in ('payout_swept_to_wallet', 'payout_swept_to_wallet_backfill')
      )
  loop
    begin
      perform public.post_ledger_entry(
        'payout_swept_to_wallet_backfill', 'wallet_transactions', r.id, 'Backfilled (Stage B)',
        jsonb_build_array(
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', r.source_group_id, 'direction', 'debit', 'amount', r.amount),
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', r.user_id, 'direction', 'credit', 'amount', r.amount)
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('payout_swept_to_wallet_backfill', 'wallet_transactions', r.id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'wallet_transactions.payout_credit'::text, v_posted, v_skipped;

  -- (d) wallet_transactions: withdrawals with no posting. Approximated
  -- by FINAL status only (no per-transition history survives for
  -- historical rows) — 'pending'/'completed' get the reservation
  -- posting (matches get_wallet_balance's own formula, which counts
  -- both the same way); 'failed' withdrawals get nothing, since their
  -- net balance effect is zero and there's nothing to reconstruct.
  v_posted := 0; v_skipped := 0;
  for r in
    select wt.* from public.wallet_transactions wt
    where wt.type = 'withdrawal' and wt.status in ('pending', 'completed') and wt.user_id is not null
      and not exists (
        select 1 from public.ledger_postings lp
        where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id
          and lp.source_event in ('wallet_withdrawal_reserved', 'wallet_withdrawal_reserved_backfill')
      )
  loop
    begin
      perform public.post_ledger_entry(
        'wallet_withdrawal_reserved_backfill', 'wallet_transactions', r.id,
        'Backfilled (Stage B) — approximated from final status only, no intermediate history available',
        jsonb_build_array(
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', r.user_id, 'direction', 'debit', 'amount', r.amount),
          jsonb_build_object('account_type', 'external_momo_disbursements', 'direction', 'credit', 'amount', r.amount)
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('wallet_withdrawal_reserved_backfill', 'wallet_transactions', r.id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'wallet_transactions.withdrawal'::text, v_posted, v_skipped;

  -- (e) paid_late contributions with no safety-fund credit posting yet
  -- (uzuza_held groups only, matching the live confirm_late_payment
  -- scope decision).
  v_posted := 0; v_skipped := 0;
  for r in
    select c.*, g.account_type as g_account_type
    from public.contributions c
    join public.groups g on g.id = c.group_id
    where c.status = 'paid_late'
      and not exists (
        select 1 from public.ledger_postings lp
        where lp.source_table = 'contributions' and lp.source_id = c.id
          and lp.source_event in ('safety_fund_late_payment_credit', 'safety_fund_late_payment_credit_backfill')
      )
  loop
    if r.g_account_type <> 'uzuza_held' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      perform public.post_ledger_entry(
        'safety_fund_late_payment_credit_backfill', 'contributions', r.id, 'Backfilled (Stage B)',
        jsonb_build_array(
          jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', r.amount + coalesce(r.missed_fine_amount, 0)),
          jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', r.group_id, 'direction', 'credit', 'amount', r.amount + coalesce(r.missed_fine_amount, 0))
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('safety_fund_late_payment_credit_backfill', 'contributions', r.id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'contributions.paid_late'::text, v_posted, v_skipped;

  -- (f) reservation-linked confirmed contributions with no subsidy
  -- posting yet (covers historical rows the live trigger above didn't
  -- exist for).
  v_posted := 0; v_skipped := 0;
  for r in
    select c.*, res.fee_amount
    from public.contributions c
    join public.reservations res on res.id = c.reservation_id
    where c.reservation_id is not null and c.status = 'confirmed'
      and not exists (
        select 1 from public.ledger_postings lp
        where lp.source_table = 'contributions' and lp.source_id = c.id
          and lp.source_event in ('reservation_conversion_subsidy', 'reservation_conversion_subsidy_backfill')
      )
  loop
    if r.amount - r.fee_amount <= 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      perform public.post_ledger_entry(
        'reservation_conversion_subsidy_backfill', 'contributions', r.id, 'Backfilled (Stage B)',
        jsonb_build_array(
          jsonb_build_object('account_type', 'platform_adjustment', 'direction', 'debit', 'amount', r.amount - r.fee_amount),
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', r.group_id, 'direction', 'credit', 'amount', r.amount - r.fee_amount)
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('reservation_conversion_subsidy_backfill', 'contributions', r.id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'contributions.reservation_conversion'::text, v_posted, v_skipped;

  -- (g) safety fund opening-balance approximation, uzuza_held groups
  -- only, one plug posting per group for whatever the exact backfills
  -- above didn't already account for. This is the one genuinely
  -- APPROXIMATE category — individual historical buffer skims and
  -- missed-payment draws have no recoverable row-level history, only
  -- the group's final safety_fund_balance column survives.
  v_posted := 0; v_skipped := 0;
  for r in
    select g.id as group_id, g.safety_fund_balance,
      coalesce((
        select ab.balance from public.ledger_accounts la
        join public.ledger_account_balances ab on ab.account_id = la.id
        where la.account_type = 'group_safety_fund' and la.owner_group_id = g.id
      ), 0) as ledger_balance
    from public.groups g
    where g.account_type = 'uzuza_held' and g.safety_fund_balance <> 0
      and not exists (
        select 1 from public.ledger_postings lp
        where lp.source_table = 'groups' and lp.source_id = g.id
          and lp.source_event = 'safety_fund_opening_balance_approximation'
      )
  loop
    v_residual := r.safety_fund_balance - r.ledger_balance;
    if v_residual = 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_residual < 0 then
      -- Should not happen (the fund can never be drawn below 0), but
      -- don't silently invent a negative adjustment if it does — flag
      -- it for a human instead of guessing.
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('safety_fund_opening_balance_approximation', 'groups', r.group_id,
        'Ledger-reconstructed balance (' || r.ledger_balance::text || ') already exceeds the legacy column (' || r.safety_fund_balance::text || ') — needs manual review, not auto-plugged');
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      perform public.post_ledger_entry(
        'safety_fund_opening_balance_approximation', 'groups', r.group_id,
        'APPROXIMATE: plugs the gap between the legacy safety_fund_balance column (' || r.safety_fund_balance::text ||
          ') and what could be exactly reconstructed from surviving history (' || r.ledger_balance::text ||
          '). Historical buffer skims and missed-payment draws before Stage A have no row-level record — only late-payment credits could be reconstructed exactly.',
        jsonb_build_array(
          jsonb_build_object('account_type', 'platform_adjustment', 'direction', 'debit', 'amount', v_residual),
          jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', r.group_id, 'direction', 'credit', 'amount', v_residual)
        )
      );
      v_posted := v_posted + 1;
    exception when others then
      insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
      values ('safety_fund_opening_balance_approximation', 'groups', r.group_id, sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select 'groups.safety_fund_opening_balance'::text, v_posted, v_skipped;
end;
$$;

select public.run_stage_b_backfill();
