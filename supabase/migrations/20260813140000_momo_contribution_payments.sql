-- Extends the real MTN MoMo Collections "Request to Pay" flow (already
-- built for event pledges) to regular ibimina contributions — the
-- Wallet's "Make a deposit" shortcut led into ContributeCard's
-- manual-proof-only flow with nowhere to actually enter an amount/phone
-- and get a payment prompt, which is exactly the gap being closed here.

alter table public.contributions
  add column collection_reference_id text,
  add column payer_phone text;

create index contributions_collection_reference_id_idx
  on public.contributions (collection_reference_id)
  where collection_reference_id is not null;

-- Mirrors confirm_contribution's approve branch exactly (custody cap
-- check + ledger insert, safety-fund buffer top-up, cycle-completion
-- check, notification) but is gated to the service role instead of a
-- group admin — a real MTN-confirmed Request to Pay is stronger proof
-- than an admin eyeballing a screenshot, but this must never be
-- callable by an ordinary client, so it's restricted to auth.role() =
-- 'service_role', which only the server-side admin client can present.
-- It also re-checks the contribution is actually in the
-- momo_collections flow and still submitted, so it can't be used to
-- rubber-stamp an unrelated contribution even from a trusted process.
create function public.momo_confirm_contribution(p_contribution_id uuid, p_reference_id text)
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
    select coalesce(sum(amount), 0) into currently_held
    from public.custody_ledger where swept_at is null;
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
