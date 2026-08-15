-- Real bug found while running the Stage A verification script:
-- ledger_accounts.owner_user_id and owner_group_id had no ON DELETE
-- behavior specified in 20260815120000_shadow_double_entry_ledger.sql,
-- defaulting to NO ACTION -- the exact same class of bug this project
-- has hit twice before (staff_users in Phase 9, rate_limit_events in
-- Phase 10; see CLAUDE.md's own dev-tooling notes about always choosing
-- ON DELETE deliberately). This silently blocked
-- auth.admin.deleteUser() for any user who ever had a wallet ledger
-- account, and blocked deleting a group that ever went uzuza_held or
-- had a confirmed contribution/reservation -- confirmed live: two
-- leftover test groups from this migration's own earlier verification
-- runs failed to clean up because of exactly this.
--
-- Fix: both go to NULL on delete, not CASCADE -- a ledger account's
-- posting history must survive the owner being deleted later, same
-- principle already applied to audit_log.actor_user_id (Phase 10)
-- rather than the CASCADE choice used for purely ephemeral rows like
-- rate_limit_events. The shape CHECK constraint is loosened to match:
-- it still prevents an account from having owner columns from the
-- wrong category, but no longer requires the "correct" owner column to
-- be non-null, since it can legitimately become null after this fix.

alter table public.ledger_accounts drop constraint if exists ledger_accounts_owner_shape;

alter table public.ledger_accounts drop constraint if exists ledger_accounts_owner_user_id_fkey;
alter table public.ledger_accounts add constraint ledger_accounts_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users (id) on delete set null;

alter table public.ledger_accounts drop constraint if exists ledger_accounts_owner_group_id_fkey;
alter table public.ledger_accounts add constraint ledger_accounts_owner_group_id_fkey
  foreign key (owner_group_id) references public.groups (id) on delete set null;

alter table public.ledger_accounts add constraint ledger_accounts_owner_shape check (
  (account_type = 'user_wallet' and owner_group_id is null)
  or (account_type in ('group_custody', 'group_safety_fund') and owner_user_id is null)
  or (account_type in ('external_momo_collections', 'external_momo_disbursements') and owner_user_id is null and owner_group_id is null)
);
