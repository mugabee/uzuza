-- The pattern that bit twice already (staff_users/rate_limit_events in
-- Phase 9/10, fixed in 20260807160000) recurred a third time — this audit
-- checks every remaining `references auth.users(id)` in the schema (24
-- columns, verified live against pg_constraint rather than re-deriving
-- from migration source) instead of patching them one discovery at a time.
--
-- Two buckets, decided per column by whether the row has independent
-- financial/audit value once the actor is gone:
--
-- SET NULL — real financial or audit-relevant records that must outlive
-- the user who touched them (a contribution, a payout, a group itself).
-- Deleting a user must never silently delete money history. Every NOT
-- NULL column in this bucket has its NOT NULL constraint dropped first,
-- since SET NULL requires the column to actually allow null.
--
-- CASCADE — rows that are meaningless without the user and carry no
-- standalone record-keeping value (a pending ID-verification request for
-- an account that no longer exists).
--
-- id_verification_requests.user_id is the only new CASCADE case; every
-- constraint below currently defaults to NO ACTION, which is what made
-- auth.admin.deleteUser() fail for essentially any user who ever
-- contributed, was paid out, reserved a spot, pledged, chatted, or was
-- otherwise referenced from group activity.

alter table public.chat_messages alter column sender_id drop not null;
alter table public.chat_messages
  drop constraint chat_messages_sender_id_fkey,
  add constraint chat_messages_sender_id_fkey
    foreign key (sender_id) references auth.users (id) on delete set null;

alter table public.contributions alter column member_id drop not null;
alter table public.contributions
  drop constraint contributions_member_id_fkey,
  add constraint contributions_member_id_fkey
    foreign key (member_id) references auth.users (id) on delete set null;
alter table public.contributions
  drop constraint contributions_confirmed_by_fkey,
  add constraint contributions_confirmed_by_fkey
    foreign key (confirmed_by) references auth.users (id) on delete set null;

-- custody_consents.user_id is part of a composite primary key
-- (group_id, user_id), so it can never be null — SET NULL isn't viable
-- here the way it is everywhere else in this migration. The record has
-- no meaning without knowing which user it was consent from, so CASCADE
-- is the right call: deleting the user deletes their consent record.
alter table public.custody_consents
  drop constraint custody_consents_user_id_fkey,
  add constraint custody_consents_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.cycles alter column recipient_user_id drop not null;
alter table public.cycles
  drop constraint cycles_recipient_user_id_fkey,
  add constraint cycles_recipient_user_id_fkey
    foreign key (recipient_user_id) references auth.users (id) on delete set null;

alter table public.event_pledges alter column pledger_id drop not null;
alter table public.event_pledges
  drop constraint event_pledges_pledger_id_fkey,
  add constraint event_pledges_pledger_id_fkey
    foreign key (pledger_id) references auth.users (id) on delete set null;
alter table public.event_pledges
  drop constraint event_pledges_confirmed_by_fkey,
  add constraint event_pledges_confirmed_by_fkey
    foreign key (confirmed_by) references auth.users (id) on delete set null;

alter table public.exit_requests alter column user_id drop not null;
alter table public.exit_requests
  drop constraint exit_requests_user_id_fkey,
  add constraint exit_requests_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;
alter table public.exit_requests
  drop constraint exit_requests_decided_by_fkey,
  add constraint exit_requests_decided_by_fkey
    foreign key (decided_by) references auth.users (id) on delete set null;

alter table public.group_change_proposals alter column proposed_by drop not null;
alter table public.group_change_proposals
  drop constraint group_change_proposals_proposed_by_fkey,
  add constraint group_change_proposals_proposed_by_fkey
    foreign key (proposed_by) references auth.users (id) on delete set null;

alter table public.groups alter column created_by drop not null;
alter table public.groups
  drop constraint groups_created_by_fkey,
  add constraint groups_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.mediation_cases alter column raised_by drop not null;
alter table public.mediation_cases
  drop constraint mediation_cases_raised_by_fkey,
  add constraint mediation_cases_raised_by_fkey
    foreign key (raised_by) references auth.users (id) on delete set null;

alter table public.pause_requests alter column user_id drop not null;
alter table public.pause_requests
  drop constraint pause_requests_user_id_fkey,
  add constraint pause_requests_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;
alter table public.pause_requests
  drop constraint pause_requests_decided_by_fkey,
  add constraint pause_requests_decided_by_fkey
    foreign key (decided_by) references auth.users (id) on delete set null;

alter table public.payout_approvals alter column approved_by drop not null;
alter table public.payout_approvals
  drop constraint payout_approvals_approved_by_fkey,
  add constraint payout_approvals_approved_by_fkey
    foreign key (approved_by) references auth.users (id) on delete set null;

alter table public.payout_requests alter column recipient_user_id drop not null;
alter table public.payout_requests
  drop constraint payout_requests_recipient_user_id_fkey,
  add constraint payout_requests_recipient_user_id_fkey
    foreign key (recipient_user_id) references auth.users (id) on delete set null;
alter table public.payout_requests alter column requested_by drop not null;
alter table public.payout_requests
  drop constraint payout_requests_requested_by_fkey,
  add constraint payout_requests_requested_by_fkey
    foreign key (requested_by) references auth.users (id) on delete set null;
alter table public.payout_requests
  drop constraint payout_requests_completed_by_fkey,
  add constraint payout_requests_completed_by_fkey
    foreign key (completed_by) references auth.users (id) on delete set null;

alter table public.profiles
  drop constraint profiles_referred_by_fkey,
  add constraint profiles_referred_by_fkey
    foreign key (referred_by) references auth.users (id) on delete set null;

alter table public.proposal_approvals alter column approved_by drop not null;
alter table public.proposal_approvals
  drop constraint proposal_approvals_approved_by_fkey,
  add constraint proposal_approvals_approved_by_fkey
    foreign key (approved_by) references auth.users (id) on delete set null;

alter table public.reservations alter column user_id drop not null;
alter table public.reservations
  drop constraint reservations_user_id_fkey,
  add constraint reservations_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;
alter table public.reservations
  drop constraint reservations_confirmed_by_fkey,
  add constraint reservations_confirmed_by_fkey
    foreign key (confirmed_by) references auth.users (id) on delete set null;

alter table public.unmatched_payments alter column reported_by drop not null;
alter table public.unmatched_payments
  drop constraint unmatched_payments_reported_by_fkey,
  add constraint unmatched_payments_reported_by_fkey
    foreign key (reported_by) references auth.users (id) on delete set null;

alter table public.id_verification_requests
  drop constraint id_verification_requests_reviewed_by_fkey,
  add constraint id_verification_requests_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users (id) on delete set null;

-- The one CASCADE case: a pending ID-verification request has no meaning
-- once the account it was for no longer exists.
alter table public.id_verification_requests
  drop constraint id_verification_requests_user_id_fkey,
  add constraint id_verification_requests_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
