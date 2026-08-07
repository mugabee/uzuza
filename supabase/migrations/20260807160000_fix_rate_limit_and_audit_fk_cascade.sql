-- Bug found via Phase 10's own live e2e testing: rate_limit_events.user_id
-- and staff_users.user_id both referenced auth.users(id) with no ON DELETE
-- behavior specified, which defaults to NO ACTION — this made
-- auth.admin.deleteUser() fail outright (500 "Database error deleting
-- user") for any user who had ever triggered a rate-limited action, or any
-- user who'd been granted staff access, since Postgres refused to leave a
-- dangling FK. staff_users existed since Phase 9 (migration
-- 20260807120000) — this same class of bug, just not caught until now
-- because no prior e2e script happened to both grant staff access to a
-- test user AND delete that user afterward in the same run.
-- rate_limit_events and staff_users rows are both fine to cascade-delete —
-- neither is meant to outlive the user. audit_log.actor_user_id gets the
-- opposite fix: it must NOT cascade (an audit trail should survive the
-- actor being deleted later), so it's switched to ON DELETE SET NULL
-- instead — the row stays, only loses the specific actor reference.

alter table public.rate_limit_events
  drop constraint rate_limit_events_user_id_fkey,
  add constraint rate_limit_events_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.staff_users
  drop constraint staff_users_user_id_fkey,
  add constraint staff_users_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.audit_log
  drop constraint audit_log_actor_user_id_fkey,
  add constraint audit_log_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users (id) on delete set null;
