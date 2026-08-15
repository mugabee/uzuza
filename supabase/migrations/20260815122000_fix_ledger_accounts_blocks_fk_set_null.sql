-- Second real bug found while cleaning up after the Stage A
-- verification script: the blanket append-only UPDATE trigger on
-- ledger_accounts (forbid_ledger_table_mutation, from the previous
-- migration) blocks EVERY update — including the system's own implicit
-- UPDATE that ON DELETE SET NULL performs when a referenced user or
-- group is deleted. That FK behavior was just added specifically to let
-- a ledger account survive its owner being deleted (previous
-- migration's fix) — but the update-blocking trigger stops that same
-- FK action from ever completing, so deleting a user/group that owns a
-- ledger account still fails outright, just with a different error
-- ("ledger_accounts is append-only") instead of the original FK error.
-- Confirmed live: both leftover test groups from earlier verification
-- runs still failed to delete after the previous fix, for this reason.
--
-- Fix: replace the blanket update-blocking trigger with one that
-- permits exactly one kind of change — an owner_user_id or
-- owner_group_id column transitioning to NULL — and still rejects
-- everything else (account_type, natural_key, created_at, or
-- re-pointing an owner column to a *different* non-null value).

drop trigger if exists ledger_accounts_no_update on public.ledger_accounts;

create function public.guard_ledger_account_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.account_type is distinct from old.account_type
    or new.natural_key is distinct from old.natural_key
    or new.created_at is distinct from old.created_at
    or (old.owner_user_id is not null and new.owner_user_id is distinct from old.owner_user_id and new.owner_user_id is not null)
    or (old.owner_group_id is not null and new.owner_group_id is distinct from old.owner_group_id and new.owner_group_id is not null)
  then
    raise exception 'ledger_accounts identity fields are immutable — only owner_user_id/owner_group_id may transition to NULL (e.g. when the owner is deleted)';
  end if;
  return new;
end;
$$;

create trigger ledger_accounts_guard_update
  before update on public.ledger_accounts
  for each row execute function public.guard_ledger_account_mutation();
