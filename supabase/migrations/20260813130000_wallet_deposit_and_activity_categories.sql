-- Two follow-ups to the Wallet page, from a closer look at the Save
-- reference:
--
-- 1. Save's Wallet/Savings screens each have a deposit action (Top up /
-- Save) that opens a "choose group" picker. Uzuza still has no personal
-- cash balance (see the wallet migration's own header note — that's a
-- deliberate, confirmed scope decision, not an oversight), but the
-- underlying need is real: a quick way to jump straight to making a
-- contribution without hunting through the group list first. This adds
-- a read function backing that picker — the actual deposit itself still
-- happens through the existing per-group ContributeCard flow (proof of
-- transfer, admin confirmation), nothing new is invented here.
--
-- 2. Save's Activities list shows distinct categories (Money received /
-- Money sent / Utilities / Donations), not one lumped "sent" figure.
-- get_wallet_summary collapsed contributions, event pledges, and
-- reservation fees into a single money_sent total — this breaks them
-- back out into their own categories, matching get_wallet_transactions'
-- existing per-kind breakdown instead of being coarser than it.

drop function if exists public.get_wallet_summary(text);
create function public.get_wallet_summary(p_period text default '7d')
returns table (
  money_received numeric,
  contributions_sent numeric,
  pledges_sent numeric,
  reservations_sent numeric
)
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

  select coalesce(sum(amount), 0) into contributions_sent
  from public.contributions
  where member_id = auth.uid() and status in ('confirmed', 'paid_late') and confirmed_at >= since;

  select coalesce(sum(amount), 0) into pledges_sent
  from public.event_pledges
  where pledger_id = auth.uid() and status = 'confirmed' and confirmed_at >= since;

  select coalesce(sum(fee_amount), 0) into reservations_sent
  from public.reservations
  where user_id = auth.uid() and status = 'confirmed' and confirmed_at >= since;

  return next;
end;
$$;

-- Backs the Wallet page's "Make a deposit" group picker: every active
-- group where this member currently has a pending or rejected
-- contribution waiting on them, i.e. somewhere a deposit is actually
-- actionable right now.
create function public.get_my_open_contributions()
returns table (
  contribution_id uuid,
  group_id uuid,
  group_name text,
  amount numeric,
  status public.contribution_status
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, g.id, g.name, c.amount, c.status
  from public.contributions c
  join public.groups g on g.id = c.group_id
  where c.member_id = auth.uid()
    -- 'rejected' is a defined enum value but never actually set anywhere —
    -- confirm_contribution's reject path returns a contribution to
    -- 'pending' (with rejected_reason populated) rather than a distinct
    -- status, so 'pending' already covers "needs resubmission" too.
    and c.status in ('pending', 'missed')
  order by g.name;
$$;
