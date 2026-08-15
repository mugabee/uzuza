-- Real bug found during final Stage B/C/D verification:
-- get_shadow_ledger_integrity_report() (written in Stage A, before
-- Stage B introduced "_backfill"-suffixed source_event names) hardcoded
-- the LIVE event name only for the topup/payout_credit/withdrawal
-- coverage checks, so a row that was correctly backfilled — proven live
-- to actually have a posting — was still reported as "missing a
-- posting" simply because its source_event carries the "_backfill"
-- suffix. custody_ledger's own check never had this bug (it doesn't
-- filter by source_event at all). Confirmed live: all 4 historical
-- completed topups had a real 'wallet_topup_completed_backfill'
-- posting each, yet the report counted them as missing.
--
-- Also narrows the withdrawal check to status in ('pending','completed')
-- only — a 'failed' withdrawal's correct posting shape genuinely
-- differs between a live-created row (reserved, then a separate
-- released reversal) and a backfilled one (Stage B intentionally skips
-- posting anything for a net-zero-effect failed withdrawal, since no
-- per-transition history survives for historical rows) — this check
-- can't safely distinguish the two, so it only asserts on the case
-- where exactly one posting shape is ever correct.

create or replace function public.get_shadow_ledger_integrity_report()
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
        and not exists (
          select 1 from public.ledger_postings lp
          where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id
            and lp.source_event in ('wallet_topup_completed', 'wallet_topup_completed_backfill')
        )),
    (select count(*) from public.wallet_transactions wt
      where wt.type = 'payout_credit' and wt.status = 'completed'
        and not exists (
          select 1 from public.ledger_postings lp
          where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id
            and lp.source_event in ('payout_swept_to_wallet', 'payout_swept_to_wallet_backfill')
        )),
    (select count(*) from public.wallet_transactions wt
      where wt.type = 'withdrawal' and wt.status in ('pending', 'completed')
        and not exists (
          select 1 from public.ledger_postings lp
          where lp.source_table = 'wallet_transactions' and lp.source_id = wt.id
            and lp.source_event in ('wallet_withdrawal_reserved', 'wallet_withdrawal_reserved_backfill')
        )),
    (select count(*) from public.ledger_posting_failures),
    (select max(created_at) from public.ledger_postings);
end;
$$;
