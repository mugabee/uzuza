-- Bug caught while verifying cancel_reservation: the plain unique
-- (group_id, user_id) constraint on reservations blocked a member from
-- ever reserving the same group again after cancelling, since the
-- cancelled row still occupied that slot. A partial unique index instead
-- only guards against a second *active* reservation, so cancelling and
-- changing your mind later actually works.

alter table public.reservations drop constraint reservations_group_id_user_id_key;

create unique index reservations_active_group_user_idx
  on public.reservations (group_id, user_id)
  where status != 'cancelled';
