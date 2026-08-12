-- get_wallet_summary was missing `return next;` — a plpgsql RETURNS TABLE
-- function with no `return next` emits zero rows, so the wallet's summary
-- card silently showed nothing at all instead of RWF 0 for a new user.
-- Caught via live verification before this ever shipped to production.
create or replace function public.get_wallet_summary(p_period text default '7d')
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

  return next;
end;
$$;
