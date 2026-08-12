-- Save app reference: the Wallet tab (personal balance, Top up/Withdraw,
-- Money received/sent activity, Transactions list). Uzuza never holds a
-- personal cash balance for a user independent of a group — only a
-- group's own funds, and even that requires legal/BNR review before real
-- money moves (CLAUDE.md Section 3.5/11). So this is a read-only personal
-- ledger: it aggregates money movement the user already has across every
-- group they're in (contributions paid, payouts received, event pledges,
-- reservation fees) into one Save-style view. No new custody, no
-- top-up/withdraw — everything here already happened via the group flows.

create function public.get_wallet_summary(p_period text default '7d')
returns table (money_received numeric, money_sent numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  since timestamptz;
begin
  since := case p_period
    when 'today' then date_trunc('day', now())
    when '30d' then now() - interval '30 days'
    else now() - interval '7 days'
  end;

  select coalesce(sum(pr.amount), 0) into money_received
  from public.payout_requests pr
  where pr.recipient_user_id = auth.uid()
    and pr.status = 'completed'
    and pr.completed_at >= since;

  select coalesce(sum(x.amt), 0) into money_sent
  from (
    select amount as amt, confirmed_at as at
    from public.contributions
    where member_id = auth.uid() and status in ('confirmed', 'paid_late')
    union all
    select amount, confirmed_at
    from public.event_pledges
    where pledger_id = auth.uid() and status = 'confirmed'
    union all
    select fee_amount, confirmed_at
    from public.reservations
    where user_id = auth.uid() and status = 'confirmed'
  ) x
  where x.at >= since;
end;
$$;

create function public.get_wallet_transactions()
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
  where pr.recipient_user_id = auth.uid() and pr.status = 'completed'

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
