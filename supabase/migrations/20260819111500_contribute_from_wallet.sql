-- "Contribute from available balance": lets a member pay a pending
-- contribution directly from their personal Uzuza wallet instead of a
-- MoMo transfer. Deliberately scoped to uzuza_held groups only — for a
-- group_owned group, Uzuza doesn't hold that group's money at all, so
-- there is no real custody account to credit; offering this button
-- there would either silently do nothing real or require inventing a
-- live cross-rail disbursement, neither of which was asked for. This
-- keeps the same custody boundary the rest of the wallet system
-- already respects.
--
-- Modeled as a single real ledger movement — Debit user_wallet /
-- Credit group_custody, no external account involved, since the money
-- never leaves Uzuza's custody boundary (it moves from the member's
-- sub-account to the group's) — the exact mirror of the existing
-- sweep_uzuza_held_payout_to_wallet posting (Debit group_custody /
-- Credit user_wallet), just the reverse direction. No proof-of-payment
-- step and no admin confirmation: unlike an external MoMo transfer,
-- Uzuza already knows with certainty this money is real (it was
-- already verified when it entered the wallet), so this behaves like
-- momo_confirm_contribution's auto-confirm, not the manual submit-
-- then-admin-confirms path.
--
-- Three existing places that independently know about wallet_transactions
-- types needed updating for the new 'contribution_payment' type, or the
-- balance would either not post correctly or the safety invariant would
-- silently stop protecting against it — exactly the "N copies of the
-- same formula" drift class of bug this project has hit before
-- (get_total_uzuza_held's own history). get_wallet_balance() and
-- get_total_uzuza_held() do NOT need touching — both already read from
-- the ledger's own balance projection (Stage C), so a correct posting
-- here is automatically reflected there.

create or replace function public.enforce_wallet_balance_non_negative()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_balance numeric;
begin
  v_user := coalesce(new.user_id, old.user_id);
  if v_user is null then
    return new;
  end if;

  select coalesce(sum(
    case
      when type = 'topup' and status = 'completed' then amount
      when type = 'payout_credit' and status = 'completed' then amount
      when type = 'withdrawal' and status in ('completed', 'pending') then -amount
      when type = 'contribution_payment' and status = 'completed' then -amount
      else 0
    end
  ), 0)
  into v_balance
  from public.wallet_transactions
  where user_id = v_user and id <> new.id;

  v_balance := v_balance + case
    when new.type = 'topup' and new.status = 'completed' then new.amount
    when new.type = 'payout_credit' and new.status = 'completed' then new.amount
    when new.type = 'withdrawal' and new.status in ('completed', 'pending') then -new.amount
    when new.type = 'contribution_payment' and new.status = 'completed' then -new.amount
    else 0
  end;

  if v_balance < 0 then
    raise exception 'This wallet transaction would leave user % with a negative balance (%)', v_user, v_balance;
  end if;

  return new;
end;
$$;

create or replace function public.capture_wallet_transaction_posting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' and new.type = 'withdrawal' then
      perform public.post_ledger_entry(
        'wallet_withdrawal_reserved', 'wallet_transactions', new.id, 'Withdrawal amount reserved from wallet',
        jsonb_build_array(
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'external_momo_disbursements', 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'INSERT' and new.type = 'payout_credit' and new.status = 'completed' then
      perform public.post_ledger_entry(
        'payout_swept_to_wallet', 'wallet_transactions', new.id, 'Group payout swept into personal wallet',
        jsonb_build_array(
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', new.source_group_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'INSERT' and new.type = 'contribution_payment' and new.status = 'completed' then
      perform public.post_ledger_entry(
        'contribution_paid_from_wallet', 'wallet_transactions', new.id, 'Personal wallet balance moved into a group contribution',
        jsonb_build_array(
          jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'debit', 'amount', new.amount),
          jsonb_build_object('account_type', 'group_custody', 'owner_group_id', new.source_group_id, 'direction', 'credit', 'amount', new.amount)
        )
      );
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
      if new.type = 'topup' and new.status = 'completed' then
        perform public.post_ledger_entry(
          'wallet_topup_completed', 'wallet_transactions', new.id, 'Wallet top-up confirmed',
          jsonb_build_array(
            jsonb_build_object('account_type', 'external_momo_collections', 'direction', 'debit', 'amount', new.amount),
            jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'credit', 'amount', new.amount)
          )
        );
      elsif new.type = 'withdrawal' and old.status = 'pending' and new.status = 'failed' then
        perform public.post_ledger_entry(
          'wallet_withdrawal_released', 'wallet_transactions', new.id, 'Failed withdrawal — reserved amount released back to wallet',
          jsonb_build_array(
            jsonb_build_object('account_type', 'external_momo_disbursements', 'direction', 'debit', 'amount', new.amount),
            jsonb_build_object('account_type', 'user_wallet', 'owner_user_id', new.user_id, 'direction', 'credit', 'amount', new.amount)
          )
        );
      end if;
    end if;
  exception when others then
    insert into public.ledger_posting_failures (source_event, source_table, source_id, error_message)
    values ('wallet_transaction_' || tg_op, 'wallet_transactions', new.id, sqlerrm);
  end;
  return new;
end;
$$;

create function public.contribute_from_wallet(p_contribution_id uuid)
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
  contribution_amount_val numeric;
  g_account_type public.account_type;
  g_safety_fund_type public.safety_fund_type;
  g_base_amount numeric;
  bal numeric;
  remaining_unconfirmed int;
begin
  perform public.check_rate_limit('contribute_from_wallet', 5);

  select group_id, cycle_id, amount, member_id
  into target_group_id, target_cycle_id, contribution_amount_val, target_member_id
  from public.contributions
  where id = p_contribution_id and status = 'pending';

  if target_group_id is null then
    raise exception 'Contribution not found or not awaiting payment';
  end if;
  if target_member_id <> auth.uid() then
    raise exception 'You can only pay your own contribution';
  end if;

  select account_type, safety_fund_type, contribution_amount, name
  into g_account_type, g_safety_fund_type, g_base_amount, target_group_name
  from public.groups where id = target_group_id;

  if g_account_type <> 'uzuza_held' then
    raise exception 'Paying from your available balance is only offered for groups where Uzuza holds the group''s funds';
  end if;

  -- Same per-user lock key request_wallet_withdrawal uses, so a
  -- concurrent withdrawal and a wallet-funded contribution for the same
  -- user correctly serialize instead of racing each other's balance check.
  perform pg_advisory_xact_lock(hashtext('uzuza_wallet_' || auth.uid()::text));

  select public.get_wallet_balance() into bal;
  if bal < contribution_amount_val then
    raise exception 'Insufficient available balance';
  end if;

  update public.contributions
  set status = 'confirmed',
      payment_channel = 'wallet_balance',
      confirmed_at = now(),
      confirmed_by = auth.uid()
  where id = p_contribution_id and status = 'pending';

  if not found then
    raise exception 'Contribution not found or not awaiting payment';
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, phone, source_group_id, completed_at)
  values (auth.uid(), 'contribution_payment', contribution_amount_val, 'completed', '', target_group_id, now());

  -- Same safety-fund buffer skim confirm_contribution/momo_confirm_contribution
  -- already apply to any confirmed contribution in a buffer-type group —
  -- this is a group-level rule independent of payment method, so it
  -- applies here exactly the same way.
  if g_safety_fund_type = 'buffer' then
    update public.groups
    set safety_fund_balance = safety_fund_balance + (g_base_amount * 0.075)
    where id = target_group_id;

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
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status not in ('confirmed', 'missed');

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;

  perform public.log_audit_event(
    'contribution_paid_from_wallet', 'contribution', p_contribution_id,
    jsonb_build_object('amount', contribution_amount_val, 'group_id', target_group_id)
  );

  perform public.create_notification(
    target_member_id, 'Payment confirmed',
    'Your ' || contribution_amount_val::text || ' RWF contribution to ' || target_group_name || ' was paid from your Uzuza wallet.',
    '/groups/' || target_group_id
  );
end;
$$;
