-- One-time cleanup, not a schema/behavior change: every prior
-- verification run for Stage A/B (e2e-shadow-ledger-check.mjs, plus
-- ad-hoc manual testing during this work) created real test groups and
-- users, which were then deleted. Thanks to the ON DELETE SET NULL fix
-- (20260815121500), their ledger_accounts rows correctly survived with
-- owner_user_id/owner_group_id nulled out instead of vanishing or
-- blocking the delete — exactly as designed. But that leaves genuine
-- test debris sitting in the shadow ledger: accounts with BOTH owner
-- columns null (impossible for any real user_wallet/group_custody/
-- group_safety_fund account, since a real one always has exactly one
-- owner column set at creation) permanently attached to postings from
-- deleted test entities.
--
-- Checked before writing this (not assumed): several of these test
-- postings pair an orphaned account with one of the singleton external
-- accounts (external_momo_collections/disbursements), which are never
-- themselves "orphaned" (they have no owner columns to begin with).
-- Deleting only the orphaned-account line and leaving the posting
-- otherwise intact would leave a one-sided, unbalanced posting behind —
-- exactly the class of bug get_shadow_ledger_integrity_report() exists
-- to catch. So this unwinds the ENTIRE posting for any posting that
-- touches an orphaned account (every line, including the external
-- side), and reverses each touched account's balance projection by the
-- exact opposite of what post_ledger_entry originally applied — not
-- just pruning one line out from under a posting that stays behind.
--
-- The delete-blocking triggers are disabled only for the duration of
-- this specific, narrowly-scoped operation and re-enabled immediately
-- after — this is not a general loosening of the append-only guarantee.

alter table public.ledger_postings disable trigger ledger_postings_no_delete;
alter table public.ledger_posting_lines disable trigger ledger_posting_lines_no_delete;
alter table public.ledger_accounts disable trigger ledger_accounts_no_delete;

do $$
declare
  v_orphan_ids uuid[];
  v_posting_ids uuid[];
  v_line record;
begin
  select array_agg(id) into v_orphan_ids
  from public.ledger_accounts
  where owner_user_id is null and owner_group_id is null
    and account_type in ('user_wallet', 'group_custody', 'group_safety_fund');

  if v_orphan_ids is null then
    return;
  end if;

  select array_agg(distinct posting_id) into v_posting_ids
  from public.ledger_posting_lines
  where account_id = any(v_orphan_ids);

  if v_posting_ids is not null then
    -- Reverse every line of every affected posting (not just the
    -- orphaned ones) from the balance projection before deleting them.
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

    -- Any surviving account (e.g. the external singletons) whose
    -- last_posting_id pointer references one of these postings must be
    -- cleared first, or the FK blocks deleting the posting.
    update public.ledger_account_balances
    set last_posting_id = null
    where last_posting_id = any(v_posting_ids);

    delete from public.ledger_posting_lines where posting_id = any(v_posting_ids);
    delete from public.ledger_postings where id = any(v_posting_ids);
  end if;

  -- Drop any account_balances rows that netted to exactly zero as a
  -- pure side effect of this cleanup AND belong to an orphaned account
  -- (a real external account reversing to zero should keep its row —
  -- only orphaned test accounts are being removed entirely).
  delete from public.ledger_account_balances where account_id = any(v_orphan_ids);
  delete from public.ledger_accounts where id = any(v_orphan_ids);
end $$;

alter table public.ledger_postings enable trigger ledger_postings_no_delete;
alter table public.ledger_posting_lines enable trigger ledger_posting_lines_no_delete;
alter table public.ledger_accounts enable trigger ledger_accounts_no_delete;
