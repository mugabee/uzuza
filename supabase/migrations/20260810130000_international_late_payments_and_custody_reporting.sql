-- Extends international payments (20260810120000) to the late-payment
-- flow, and surfaces payer currency in the two custody reporting views
-- (per-group reconciliation, platform-wide monitor) so a diaspora
-- contribution doesn't just show as an unexplained RWF number to admins
-- and staff.

drop function public.submit_late_payment_proof(uuid, text, text);

create function public.submit_late_payment_proof(
  p_contribution_id uuid,
  p_transaction_id text,
  p_screenshot_path text,
  p_payment_channel public.payment_channel default 'momo_manual',
  p_payer_currency text default 'RWF',
  p_payer_amount numeric default null,
  p_fx_rate_to_rwf numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('submit_late_payment_proof', 5);

  update public.contributions
  set status = 'late_submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      submitted_at = now(),
      payment_channel = p_payment_channel,
      payer_currency = upper(p_payer_currency),
      payer_amount = p_payer_amount,
      fx_rate_to_rwf = p_fx_rate_to_rwf
  where id = p_contribution_id
    and member_id = auth.uid()
    and status = 'missed';

  if not found then
    raise exception 'Contribution not found, not yours, or not awaiting a late payment';
  end if;
end;
$$;

-- get_custody_reconciliation gains three new return columns (payment
-- channel/currency/amount), joined back from whichever source table the
-- ledger entry came from - custody_ledger itself stays RWF-only, the
-- payer's own currency lives on the contribution/reservation row that
-- generated the entry.

drop function public.get_custody_reconciliation(uuid);

create function public.get_custody_reconciliation(p_group_id uuid)
returns table (
  entry_id uuid,
  source text,
  amount numeric,
  held_at timestamptz,
  swept_at timestamptz,
  payment_channel public.payment_channel,
  payer_currency text,
  payer_amount numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can view custody reconciliation';
  end if;

  return query
  select
    cl.id,
    case when cl.reservation_id is not null then 'reservation' else 'contribution' end,
    cl.amount,
    cl.held_at,
    cl.swept_at,
    coalesce(r.payment_channel, c.payment_channel),
    coalesce(r.payer_currency, c.payer_currency),
    coalesce(r.payer_amount, c.payer_amount)
  from public.custody_ledger cl
  left join public.reservations r on r.id = cl.reservation_id
  left join public.contributions c on c.id = cl.contribution_id
  where cl.group_id = p_group_id
  order by cl.held_at desc;
end;
$$;

-- get_custody_overview: recent_sweeps entries gain currency fields, and a
-- new international_held_count gives staff an at-a-glance signal for how
-- much of the currently-held (unswept) total came in via a non-Rwanda
-- channel, without having to open every group's own reconciliation page.

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
    (select coalesce(sum(amount), 0) from public.custody_ledger where swept_at is null),
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
