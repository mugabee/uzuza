-- Continuation of the previous migration's fixes, split out because the
-- previous file had already been applied by the time these two pieces
-- were written — keeping a migration's on-disk content matching exactly
-- what was actually run against the database, rather than editing a
-- file after the fact and hoping the runner re-applies it (it won't;
-- it tracks by filename).

-- get_total_uzuza_held() is a platform-wide figure, not scoped to the
-- calling user like get_wallet_balance() is, so it shouldn't be callable
-- directly by a regular member. Revoking direct API access doesn't
-- affect the calls made to it from inside confirm_contribution and
-- friends, since those execute as the function owner regardless of the
-- original caller's own grants.
revoke execute on function public.get_total_uzuza_held() from anon, authenticated;

create or replace function public.request_wallet_withdrawal(p_amount numeric, p_phone text)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  new_id uuid;
  ref text;
begin
  perform public.require_fund_release_mfa();
  perform public.check_rate_limit('request_wallet_withdrawal', 60);

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  -- Per-user lock so two withdrawal requests submitted close together
  -- can't both read the same balance before either one's insert
  -- commits — without this, both could pass the balance check against
  -- money that's really only there once.
  perform pg_advisory_xact_lock(hashtext('uzuza_wallet_' || auth.uid()::text));

  select public.get_wallet_balance() into bal;
  if bal < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  ref := 'UZW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.wallet_transactions (user_id, type, amount, status, phone, disbursement_reference_id)
  values (auth.uid(), 'withdrawal', p_amount, 'pending', p_phone, ref)
  returning wallet_transactions.id into new_id;

  perform public.log_audit_event('wallet_withdrawal_requested', 'wallet_transaction', new_id, jsonb_build_object('amount', p_amount));

  return query select new_id, ref;
end;
$$;
