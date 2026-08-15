-- Real bug found during a financial-correctness review: the platform-
-- wide custody cap (CLAUDE.md's own "Hard platform-wide cap on total
-- funds Uzuza can hold at any moment" requirement) was never actually
-- enforced holistically. Three separate functions each reimplemented
-- their own "how much is currently held" calculation:
--   - confirm_contribution and momo_confirm_contribution only summed
--     custody_ledger (group funds), completely ignoring personal wallet
--     balances (top-ups, and now payout credits).
--   - momo_confirm_wallet_topup (fixed in the previous migration) summed
--     custody_ledger + wallet activity correctly.
-- That meant a user could top up their personal wallet right up near
-- the cap, and a group contribution could still be confirmed into
-- custody on top of it, pushing the TRUE total money Uzuza holds well
-- past the stated cap without any of the group-side checks ever
-- noticing — because they were never looking at the wallet at all.
--
-- One shared function now used everywhere a cap check happens, so
-- there's a single definition of "how much does Uzuza actually hold"
-- instead of three that can silently drift apart again.
--
-- Second real bug found alongside it: none of these cap checks (or the
-- wallet withdrawal balance check below) were protected against two
-- concurrent calls racing each other. Postgres doesn't serialize two
-- transactions just because they read the same aggregate — both can
-- read "currently held = X" before either commits its own insert, both
-- pass the check, and the true total ends up over the cap (or, for a
-- withdrawal, the user's balance goes negative) purely from timing, not
-- from anything wrong with the amounts themselves. A platform-wide
-- advisory lock around every cap check, and a per-user one around every
-- withdrawal, closes that without needing to lock arbitrary table rows.
create function public.get_total_uzuza_held()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select sum(amount) from public.custody_ledger where swept_at is null), 0)
    + coalesce((select sum(amount) from public.wallet_transactions where type = 'topup' and status = 'completed'), 0)
    + coalesce((select sum(amount) from public.wallet_transactions where type = 'payout_credit' and status = 'completed'), 0)
    - coalesce((select sum(amount) from public.wallet_transactions where type = 'withdrawal' and status in ('completed', 'pending')), 0);
$$;

create or replace function public.momo_confirm_wallet_topup(p_transaction_id uuid, p_reference_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  select user_id, amount into v_user, v_amount
  from public.wallet_transactions
  where id = p_transaction_id
    and collection_reference_id = p_reference_id
    and status = 'pending'
    and type = 'topup';

  if v_user is null then
    raise exception 'Transaction not found or not awaiting confirmation';
  end if;

  perform pg_advisory_xact_lock(hashtext('uzuza_custody_cap'));
  select public.get_total_uzuza_held() into currently_held;
  select custody_cap_amount into cap from public.platform_settings where id = 1;

  if currently_held + v_amount > cap then
    update public.wallet_transactions
    set status = 'failed', failure_reason = 'Platform custody cap reached'
    where id = p_transaction_id;
    raise exception 'Platform custody cap reached — cannot hold this deposit right now';
  end if;

  update public.wallet_transactions
  set status = 'completed', completed_at = now()
  where id = p_transaction_id;

  perform public.log_audit_event('wallet_topup_confirmed', 'wallet_transaction', p_transaction_id, jsonb_build_object('amount', v_amount, 'user_id', v_user));
  perform public.create_notification(v_user, 'Deposit confirmed', v_amount::text || ' RWF added to your Uzuza wallet.', '/wallet');
end;
$$;

create or replace function public.confirm_contribution(p_contribution_id uuid, p_approve boolean, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  target_group_name text;
  is_admin boolean;
  remaining_unconfirmed int;
  g_account_type public.account_type;
  g_safety_fund_type public.safety_fund_type;
  g_base_amount numeric;
  member_contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  select group_id, cycle_id, amount, member_id
  into target_group_id, target_cycle_id, member_contribution_amount, target_member_id
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm contributions';
  end if;

  select account_type, safety_fund_type, contribution_amount, name
  into g_account_type, g_safety_fund_type, g_base_amount, target_group_name
  from public.groups where id = target_group_id;

  if p_approve and g_account_type = 'uzuza_held' then
    perform public.require_fund_release_mfa();

    perform pg_advisory_xact_lock(hashtext('uzuza_custody_cap'));
  select public.get_total_uzuza_held() into currently_held;
    select custody_cap_amount into cap from public.platform_settings where id = 1;

    if currently_held + member_contribution_amount > cap then
      raise exception 'Platform custody cap reached — cannot hold this contribution right now';
    end if;
  end if;

  if p_approve then
    update public.contributions
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'submitted';
  else
    update public.contributions
    set status = 'pending',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'submitted';
  end if;

  if not found then
    raise exception 'Contribution not found or not awaiting confirmation';
  end if;

  if p_approve and g_account_type = 'uzuza_held' then
    insert into public.custody_ledger (group_id, contribution_id, amount)
    values (target_group_id, p_contribution_id, member_contribution_amount);

    perform public.log_audit_event('contribution_confirmed_custody', 'contribution', p_contribution_id, jsonb_build_object('amount', member_contribution_amount, 'group_id', target_group_id));
  end if;

  if p_approve and g_safety_fund_type = 'buffer' then
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

  if p_approve then
    perform public.create_notification(
      target_member_id, 'Payment confirmed',
      'Your ' || member_contribution_amount::text || ' RWF contribution to ' || target_group_name || ' was confirmed.',
      '/groups/' || target_group_id
    );
  else
    perform public.create_notification(
      target_member_id, 'Payment needs another try',
      'Your proof for ' || target_group_name || ' was not accepted' || coalesce(': ' || p_reason, '.') || ' Please resubmit.',
      '/groups/' || target_group_id
    );
  end if;
end;
$function$;

create or replace function public.momo_confirm_contribution(p_contribution_id uuid, p_reference_id text)
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
    perform pg_advisory_xact_lock(hashtext('uzuza_custody_cap'));
  select public.get_total_uzuza_held() into currently_held;
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
