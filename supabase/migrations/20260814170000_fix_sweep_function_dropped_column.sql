-- Real, currently-live bug found while testing the wallet-credit sweep:
-- payout_requests.swept_at was dropped as dead code in
-- 20260813120000_drop_dead_payout_requests_swept_at.sql, but the
-- sweep-out cron route (and the sweep_uzuza_held_payout_to_wallet
-- function that migration 20260814140000 just added, copying the same
-- pattern from the route it replaced) still referenced it — confirmed
-- via a real 500 from the live deployed cron route
-- ("column payout_requests.swept_at does not exist"), not assumed. That
-- migration's own claim that nothing reads/writes the column was wrong
-- for the route as it existed at the time, and automated sweep-out has
-- been silently broken in production ever since — nothing caught it
-- because it hadn't been exercised end-to-end since. status='approved'
-- is already sufficient to guard against double-processing, since this
-- function flips it straight to 'completed' in the same transaction.
create or replace function public.sweep_uzuza_held_payout_to_wallet(p_payout_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_recipient uuid;
  v_amount numeric;
  v_account_type public.account_type;
  v_phone text;
  v_wallet_tx_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  select pr.group_id, pr.recipient_user_id, pr.amount, g.account_type
  into v_group_id, v_recipient, v_amount, v_account_type
  from public.payout_requests pr
  join public.groups g on g.id = pr.group_id
  where pr.id = p_payout_request_id
    and pr.status = 'approved'
  for update of pr;

  if v_group_id is null then
    raise exception 'Payout request not found or not ready to sweep';
  end if;
  if v_account_type <> 'uzuza_held' then
    raise exception 'This payout is not on a Uzuza-held custody group';
  end if;

  select phone into v_phone from public.profiles where id = v_recipient;

  insert into public.wallet_transactions (user_id, type, amount, status, phone, source_group_id, completed_at)
  values (v_recipient, 'payout_credit', v_amount, 'completed', coalesce(v_phone, ''), v_group_id, now())
  returning id into v_wallet_tx_id;

  update public.payout_requests
  set status = 'completed',
      transaction_id = 'WALLET-' || v_wallet_tx_id::text,
      completed_at = now()
  where id = p_payout_request_id;

  update public.custody_ledger
  set swept_at = now(), swept_reference = 'WALLET-' || v_wallet_tx_id::text
  where group_id = v_group_id and swept_at is null;

  perform public.log_audit_event(
    'payout_swept_to_wallet', 'payout_request', p_payout_request_id,
    jsonb_build_object('amount', v_amount, 'recipient', v_recipient, 'wallet_transaction_id', v_wallet_tx_id)
  );
  perform public.create_notification(
    v_recipient, 'Payout added to your wallet',
    v_amount::text || ' RWF from your group payout is now in your Uzuza wallet — withdraw anytime from the Wallet tab.',
    '/wallet'
  );

  return v_wallet_tx_id;
end;
$$;
