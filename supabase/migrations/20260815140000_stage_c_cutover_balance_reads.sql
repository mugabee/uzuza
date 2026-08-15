-- Stage C: cut the highest-value, highest-duplication balance reads
-- over to the shadow ledger as their source of truth. Same signatures,
-- same callers, same RLS/execute grants as before — every call site
-- (get_wallet_balance from 3 TS files + 3 SQL functions,
-- get_total_uzuza_held from 3 SQL functions, get_custody_overview from
-- 1 TS page) keeps working unmodified. wallet_transactions and
-- custody_ledger themselves are untouched and keep serving as the
-- supporting detail/audit tables for the activity-feed and
-- reconciliation UIs — only the AGGREGATE balance computation moves.
--
-- get_wallet_balance(): was independently re-typed in five places
-- (Stage A's own research found this) — now the ledger's own
-- ledger_account_balances projection for that user's user_wallet
-- account, falling back to 0 for a user with no wallet activity yet
-- (no account row exists until their first transaction).
--
-- get_total_uzuza_held(): "real total held" = every internal account's
-- balance (group_custody + group_safety_fund + user_wallet) PLUS the
-- platform_adjustment account's own balance. This isn't a simplification
-- — it's the specific correction needed so disclosed/approximate value
-- (the reservation-conversion subsidy, the safety-fund backfill
-- plug) never counts toward real custody-cap exposure. Concretely: a
-- posting that credits group_custody from platform_adjustment increases
-- group_custody's balance but *decreases* platform_adjustment's by the
-- same amount, so adding platform_adjustment's balance back in exactly
-- cancels the fabricated portion while leaving genuine
-- external_momo-sourced inflows fully counted (double-entry's own
-- zero-sum property doing the work, not a special case coded by hand).
--
-- get_custody_overview()'s held_total: previously computed a NARROWER,
-- diverging number (raw unswept custody_ledger only) than
-- get_total_uzuza_held()'s cap-enforcement figure — this is the exact
-- live inconsistency flagged in the Stage A report. Cutting it over to
-- the same ledger-derived total as get_total_uzuza_held() makes the
-- staff dashboard and the cap check agree by construction from now on.

create or replace function public.get_wallet_balance()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select ab.balance
    from public.ledger_accounts la
    join public.ledger_account_balances ab on ab.account_id = la.id
    where la.account_type = 'user_wallet' and la.owner_user_id = auth.uid()
  ), 0);
$$;

create or replace function public.get_total_uzuza_held()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((
      select sum(ab.balance)
      from public.ledger_accounts la
      join public.ledger_account_balances ab on ab.account_id = la.id
      where la.account_type in ('group_custody', 'group_safety_fund', 'user_wallet')
    ), 0)
    + coalesce((
      select ab.balance
      from public.ledger_accounts la
      join public.ledger_account_balances ab on ab.account_id = la.id
      where la.account_type = 'platform_adjustment'
    ), 0);
$$;

drop function public.get_custody_overview();

create function public.get_custody_overview()
returns table (
  held_total numeric,
  custody_cap numeric,
  international_held_count int,
  recent_sweeps jsonb
)
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
  select
    public.get_total_uzuza_held(),
    (select custody_cap_amount from public.platform_settings where id = 1),
    (
      select count(*)::int from public.custody_ledger cl
      left join public.reservations r on r.id = cl.reservation_id
      left join public.contributions c on c.id = cl.contribution_id
      where cl.swept_at is null
        and coalesce(r.payment_channel, c.payment_channel, 'momo_manual') != 'momo_manual'
    ),
    (
      select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) from (
        select
          cl.amount,
          cl.swept_at,
          coalesce(r.payment_channel, c.payment_channel) as payment_channel,
          coalesce(r.payer_currency, c.payer_currency) as payer_currency,
          coalesce(r.payer_amount, c.payer_amount) as payer_amount
        from public.custody_ledger cl
        left join public.reservations r on r.id = cl.reservation_id
        left join public.contributions c on c.id = cl.contribution_id
        where cl.swept_at is not null
        order by cl.swept_at desc
        limit 10
      ) s
    );
end;
$$;
