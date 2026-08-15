-- Fix a real bug in get_ledger_integrity_report() (just-added in
-- 20260815110000_ledger_hardening.sql, applied already so this must be a
-- fresh migration rather than an edit to that file): it referenced
-- payout_requests.swept_at, which was dropped as dead code back in
-- 20260813120000_drop_dead_payout_requests_swept_at.sql. A completed
-- uzuza_held payout is actually marked "swept to wallet" by
-- sweep_uzuza_held_payout_to_wallet() setting transaction_id to a
-- 'WALLET-' prefixed value (see 20260814170000) — use that instead.
-- CREATE FUNCTION didn't catch this at creation time (plpgsql only
-- validates SQL semantically when a statement actually runs), so this
-- was only caught by checking the query against the real dropped-column
-- migration before ever calling the function.

create or replace function public.get_ledger_integrity_report()
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
      where pr.status = 'completed' and g.account_type = 'uzuza_held'
        and (pr.transaction_id is null or pr.transaction_id not like 'WALLET-%')),
    (select count(*) from public.contributions where status in ('confirmed', 'paid_late') and transaction_id is null),
    (select count(*) from public.payout_requests where status = 'completed' and transaction_id is null),
    (select count(*) from public.ledger_events),
    (select max(occurred_at) from public.ledger_events);
end;
$$;
