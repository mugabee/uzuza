-- International payments: a sender abroad can pay a contribution, event
-- pledge, or reservation deposit in their own currency, through a channel
-- other than domestic Rwanda MoMo, while the group's own bookkeeping stays
-- entirely in RWF (contribution_amount, approval thresholds, fines, safety
-- fund percentages, custody caps are all still RWF-native — nothing about
-- the core ledger becomes multi-currency, only how a payer got the RWF-
-- equivalent value in).
--
-- payment_channel:
--   momo_manual          - existing default: Rwanda MTN/Airtel MoMo,
--                           screenshot + transaction ID, unchanged behavior
--   international_manual - bank wire / Wise / a remittance agent, sender
--                           reports what they actually sent, proof
--                           submitted the same way
--   momo_remittance       - sent via an MTN Mobile Money remittance
--                           corridor; still proof-submitted manually here,
--                           but tagged distinctly so staff can look the
--                           transaction up via the real MTN Remittances
--                           API (lib/momo-remittances.ts) as a confirmation
--                           aid
--   card_gateway          - reserved for a real payment gateway
--                           (Stripe/Wise API etc.) later; schema-ready, not
--                           yet selectable in any form

create type public.payment_channel as enum (
  'momo_manual',
  'international_manual',
  'momo_remittance',
  'card_gateway'
);

alter table public.contributions
  add column payment_channel public.payment_channel not null default 'momo_manual',
  add column payer_currency text not null default 'RWF',
  add column payer_amount numeric(14, 2),
  add column fx_rate_to_rwf numeric(14, 6);

alter table public.event_pledges
  add column payment_channel public.payment_channel not null default 'momo_manual',
  add column payer_currency text not null default 'RWF',
  add column payer_amount numeric(14, 2),
  add column fx_rate_to_rwf numeric(14, 6);

alter table public.reservations
  add column payment_channel public.payment_channel not null default 'momo_manual',
  add column payer_currency text not null default 'RWF',
  add column payer_amount numeric(14, 2),
  add column fx_rate_to_rwf numeric(14, 6);

-- The three proof-submission RPCs each get four new optional trailing
-- params. CREATE OR REPLACE does not update a function whose parameter
-- list changed (the exact overload gotcha documented in CLAUDE.md, bit
-- twice already on create_group) - so the old 3-arg signatures are
-- dropped explicitly here rather than left as dead duplicate overloads.

drop function public.submit_contribution_proof(uuid, text, text);

create function public.submit_contribution_proof(
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
  perform public.check_rate_limit('submit_contribution_proof', 5);

  update public.contributions
  set status = 'submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      submitted_at = now(),
      payment_channel = p_payment_channel,
      payer_currency = upper(p_payer_currency),
      payer_amount = p_payer_amount,
      fx_rate_to_rwf = p_fx_rate_to_rwf
  where id = p_contribution_id
    and member_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Contribution not found, not yours, or not pending';
  end if;
end;
$$;

drop function public.submit_pledge_proof(uuid, text, text);

create function public.submit_pledge_proof(
  p_pledge_id uuid,
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
  update public.event_pledges
  set status = 'submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      payment_channel = p_payment_channel,
      payer_currency = upper(p_payer_currency),
      payer_amount = p_payer_amount,
      fx_rate_to_rwf = p_fx_rate_to_rwf
  where id = p_pledge_id and pledger_id = auth.uid() and status = 'pledged';

  if not found then
    raise exception 'Pledge not found, not yours, or not pending payment';
  end if;
end;
$$;

drop function public.submit_reservation_proof(uuid, text, text);

create function public.submit_reservation_proof(
  p_reservation_id uuid,
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
  update public.reservations
  set status = 'submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      payment_channel = p_payment_channel,
      payer_currency = upper(p_payer_currency),
      payer_amount = p_payer_amount,
      fx_rate_to_rwf = p_fx_rate_to_rwf
  where id = p_reservation_id and user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'Reservation not found, not yours, or not pending';
  end if;
end;
$$;
