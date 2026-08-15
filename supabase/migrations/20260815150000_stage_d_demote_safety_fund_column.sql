-- Stage D: demote groups.safety_fund_balance to a pure read model — but
-- only for the scope the ledger actually covers. Confirmed before
-- writing this (not assumed): no UI or API anywhere reads
-- safety_fund_balance directly (only its sibling safety_fund_type is
-- ever shown to users); the ONLY place its VALUE drives real logic is
-- report_missed_payment's `fund_balance >= p_fine_amount` check. That
-- narrows Stage D to exactly two changes:
--
--   1. get_group_safety_fund_balance(group_id): for a uzuza_held group,
--      returns the ledger's own balance for that group's
--      group_safety_fund account (0 if none exists yet) — the ledger
--      becomes sole authority. For a group_owned group, returns the
--      legacy column directly, completely unchanged — group_owned
--      groups were never in the shadow ledger's scope (Uzuza holds none
--      of their real money), so there is nothing to demote there; that
--      boundary stays exactly where Stage A drew it.
--
--   2. confirm_contribution, momo_confirm_contribution,
--      report_missed_payment, and confirm_late_payment stop writing
--      groups.safety_fund_balance directly for uzuza_held groups (the
--      ledger posting is now sole authority for that case) while
--      leaving the group_owned branch's direct UPDATE completely
--      untouched. This *must* happen in the same migration as the read
--      cutover — keeping both the old direct UPDATE and the new
--      ledger-driven read active at once would double-count every
--      change for a uzuza_held group.
--
-- report_missed_payment is rewritten to call
-- get_group_safety_fund_balance() instead of reading the column
-- directly, so its behavior for a group_owned group is byte-identical
-- to before (same column, same value), and for a uzuza_held group it
-- now checks the actual ledger-derived balance instead of a column that
-- would otherwise silently stop being updated.

create function public.get_group_safety_fund_balance(p_group_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_account_type public.account_type;
  v_column_balance numeric;
  v_ledger_balance numeric;
begin
  select account_type, safety_fund_balance into v_account_type, v_column_balance
  from public.groups where id = p_group_id;

  if v_account_type is null then
    return 0;
  end if;

  if v_account_type <> 'uzuza_held' then
    return v_column_balance;
  end if;

  select ab.balance into v_ledger_balance
  from public.ledger_accounts la
  join public.ledger_account_balances ab on ab.account_id = la.id
  where la.account_type = 'group_safety_fund' and la.owner_group_id = p_group_id;

  return coalesce(v_ledger_balance, 0);
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
    if g_account_type = 'uzuza_held' then
      -- The ledger is sole authority here now — no direct column write,
      -- since the posting below (via the balance projection) IS the
      -- group's real safety fund balance for a uzuza_held group.
      begin
        perform public.post_ledger_entry(
          'safety_fund_buffer_skim', 'groups', target_group_id, 'Buffer skim reallocated from custody to safety fund',
          jsonb_build_array(
            jsonb_build_object('account_type', 'group_custody', 'owner_group_id', target_group_id, 'direction', 'debit', 'amount', g_base_amount * 0.075),
            jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', g_base_amount * 0.075)
          )
        );
      exception when others then
        insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
        values ('safety_fund_buffer_skim', 'groups', target_group_id, sqlerrm);
      end;
    else
      -- group_owned: unchanged legacy behaviour — Uzuza holds none of
      -- this group's real money, so this column is the only record of
      -- its safety fund and stays directly written, exactly as before.
      update public.groups
      set safety_fund_balance = safety_fund_balance + (g_base_amount * 0.075)
      where id = target_group_id;
    end if;
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
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
    if g_account_type = 'uzuza_held' then
      begin
        perform public.post_ledger_entry(
          'safety_fund_buffer_skim', 'groups', target_group_id, 'Buffer skim reallocated from custody to safety fund',
          jsonb_build_array(
            jsonb_build_object('account_type', 'group_custody', 'owner_group_id', target_group_id, 'direction', 'debit', 'amount', g_base_amount * 0.075),
            jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', g_base_amount * 0.075)
          )
        );
      exception when others then
        insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
        values ('safety_fund_buffer_skim', 'groups', target_group_id, sqlerrm);
      end;
    else
      update public.groups
      set safety_fund_balance = safety_fund_balance + (g_base_amount * 0.075)
      where id = target_group_id;
    end if;
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

create or replace function public.report_missed_payment(p_contribution_id uuid, p_fine_amount numeric)
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
  recipient_paid boolean;
  fund_type public.safety_fund_type;
  fund_balance numeric;
  g_account_type public.account_type;
  remaining_unconfirmed int;
begin
  select group_id, cycle_id, member_id
  into target_group_id, target_cycle_id, target_member_id
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can report a missed payment';
  end if;

  update public.contributions
  set status = 'missed', missed_fine_amount = p_fine_amount
  where id = p_contribution_id and status in ('pending', 'submitted');

  if not found then
    raise exception 'Contribution not found or already resolved';
  end if;

  select exists (
    select 1 from public.cycles c
    join public.payout_requests pr on pr.cycle_id = c.id
    where c.group_id = target_group_id
      and pr.recipient_user_id = target_member_id
      and pr.status = 'completed'
  ) into recipient_paid;

  if recipient_paid then
    select safety_fund_type, account_type into fund_type, g_account_type
    from public.groups where id = target_group_id;
    -- Sole authoritative read of the current balance for this check —
    -- ledger-derived for a uzuza_held group, the legacy column for a
    -- group_owned one (see get_group_safety_fund_balance).
    fund_balance := public.get_group_safety_fund_balance(target_group_id);

    if fund_type != 'off' and fund_balance >= p_fine_amount then
      if g_account_type = 'uzuza_held' then
        begin
          perform public.post_ledger_entry(
            'safety_fund_draw', 'groups', target_group_id, 'Safety fund absorbed a missed-payment shortfall',
            jsonb_build_array(
              jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'debit', 'amount', p_fine_amount),
              jsonb_build_object('account_type', 'group_custody', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', p_fine_amount)
            )
          );
        exception when others then
          insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
          values ('safety_fund_draw', 'groups', target_group_id, sqlerrm);
        end;
      else
        update public.groups
        set safety_fund_balance = safety_fund_balance - p_fine_amount
        where id = target_group_id;
      end if;
    end if;
    -- If the fund can't cover it, the contribution stays 'missed' with no
    -- further automatic action — Section 3.7 calls for an explicit group
    -- decision at that point, not a silent write.
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;

  perform public.log_audit_event('missed_payment_reported', 'contribution', p_contribution_id, jsonb_build_object('fine_amount', p_fine_amount, 'recipient_paid', recipient_paid));

  select name into target_group_name from public.groups where id = target_group_id;
  perform public.create_notification(
    target_member_id, 'Missed payment reported',
    'A ' || p_fine_amount::text || ' RWF fine was added in ' || target_group_name || '. You can pay late to stay in good standing.',
    '/groups/' || target_group_id
  );
end;
$function$;

create or replace function public.confirm_late_payment(p_contribution_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  is_admin boolean;
  owed_amount numeric;
  fine_amount numeric;
  g_account_type public.account_type;
begin
  select group_id, amount, coalesce(missed_fine_amount, 0)
  into target_group_id, owed_amount, fine_amount
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a late payment';
  end if;

  if p_approve then
    update public.contributions
    set status = 'paid_late', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;

    select account_type into g_account_type from public.groups where id = target_group_id;

    if g_account_type = 'uzuza_held' then
      begin
        perform public.post_ledger_entry(
          'safety_fund_late_payment_credit', 'groups', target_group_id, 'Late payment credited to safety fund',
          jsonb_build_array(
            jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', owed_amount + fine_amount),
            jsonb_build_object('account_type', 'group_safety_fund', 'owner_group_id', target_group_id, 'direction', 'credit', 'amount', owed_amount + fine_amount)
          )
        );
      exception when others then
        insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
        values ('safety_fund_late_payment_credit', 'groups', target_group_id, sqlerrm);
      end;
    else
      update public.groups
      set safety_fund_balance = safety_fund_balance + owed_amount + fine_amount
      where id = target_group_id;
    end if;

    perform public.log_audit_event('late_payment_confirmed', 'contribution', p_contribution_id, jsonb_build_object('amount', owed_amount, 'fine_amount', fine_amount));
  else
    update public.contributions
    set status = 'missed',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;
  end if;
end;
$$;
