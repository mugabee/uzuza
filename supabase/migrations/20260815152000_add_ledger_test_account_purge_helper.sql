-- Utility discovered as a real, disclosed limitation while re-running
-- Stage B/C/D verification twice in a row: the shadow ledger correctly
-- NEVER forgets financial history, even after a domain row (a test
-- group's custody_ledger/contributions/wallet_transactions rows) is
-- hard-deleted — there is no FK-driven cascade from those tables to
-- ledger_postings, only a loose source_table/source_id reference, by
-- design (a real group is never actually hard-deleted in production, so
-- this was never meant to auto-unwind). That's correct and intentional
-- for real data, but it means repeated e2e test runs — which DO hard-
-- delete their own test groups/users in cleanup — permanently
-- accumulate orphaned ledger_accounts/postings, which then skew any
-- test that compares the ledger's total against a freshly-recomputed
-- legacy-formula total.
--
-- This SECURITY DEFINER helper (service-role only, mirroring the same
-- restriction as post_ledger_entry itself) does exactly what the
-- earlier one-time cleanup migration (20260815131500) did by hand,
-- packaged as a reusable function so verification scripts can restore a
-- clean baseline between runs without needing raw SQL access.

create function public.purge_orphaned_ledger_test_accounts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orphan_ids uuid[];
  v_posting_ids uuid[];
  v_line record;
  v_count int;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  select array_agg(id) into v_orphan_ids
  from public.ledger_accounts
  where owner_user_id is null and owner_group_id is null
    and account_type in ('user_wallet', 'group_custody', 'group_safety_fund');

  if v_orphan_ids is null then
    return 0;
  end if;
  v_count := array_length(v_orphan_ids, 1);

  select array_agg(distinct posting_id) into v_posting_ids
  from public.ledger_posting_lines
  where account_id = any(v_orphan_ids);

  if v_posting_ids is not null then
    for v_line in
      select account_id, direction, amount
      from public.ledger_posting_lines
      where posting_id = any(v_posting_ids)
    loop
      update public.ledger_account_balances
      set balance = balance - (case when v_line.direction = 'credit' then v_line.amount else -v_line.amount end),
          updated_at = now()
      where account_id = v_line.account_id;
    end loop;

    update public.ledger_account_balances set last_posting_id = null where last_posting_id = any(v_posting_ids);
  end if;

  alter table public.ledger_postings disable trigger ledger_postings_no_delete;
  alter table public.ledger_posting_lines disable trigger ledger_posting_lines_no_delete;
  alter table public.ledger_accounts disable trigger ledger_accounts_no_delete;

  if v_posting_ids is not null then
    delete from public.ledger_posting_lines where posting_id = any(v_posting_ids);
    delete from public.ledger_postings where id = any(v_posting_ids);
  end if;

  delete from public.ledger_account_balances where account_id = any(v_orphan_ids);
  delete from public.ledger_accounts where id = any(v_orphan_ids);

  alter table public.ledger_postings enable trigger ledger_postings_no_delete;
  alter table public.ledger_posting_lines enable trigger ledger_posting_lines_no_delete;
  alter table public.ledger_accounts enable trigger ledger_accounts_no_delete;

  return v_count;
end;
$$;

revoke execute on function public.purge_orphaned_ledger_test_accounts() from public;
