-- Same class of bug as the previous migration: unique_reference is
-- generated deterministically from group_id + user_id, so a re-reservation
-- after cancelling would try to reuse the exact same reference string and
-- collide with the cancelled row's globally-unique constraint. Same fix:
-- only the active reservation for a given reference needs to be unique.

alter table public.reservations drop constraint reservations_unique_reference_key;

create unique index reservations_active_reference_idx
  on public.reservations (unique_reference)
  where status != 'cancelled';
