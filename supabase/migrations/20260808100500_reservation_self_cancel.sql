-- Section 3.4 / Section 7 risk register: reservation self-cancellation
-- needed an explicit rule and was flagged in Section 11 as still an open
-- decision. This ships the part that has a clear, defensible answer and
-- is honest about the part that does not.
--
-- Before a deposit has actually been confirmed and recorded in
-- custody_ledger, no money has moved yet, so cancelling is free and
-- immediate — same shape as cancel_pledge's pre-payment case. Once a
-- reservation is confirmed, Uzuza is actually holding the member's money;
-- unwinding that is a real fund movement, not a database update, and the
-- exact refund-versus-forfeit split is the part Section 11 leaves
-- undecided. Rather than invent a number, this routes that case to the
-- mediation queue already built in Phase 8, the same escalation path used
-- for every other situation that needs a person rather than an automatic
-- rule.

create function public.cancel_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_status public.reservation_status;
begin
  select group_id, status into target_group_id, target_status
  from public.reservations
  where id = p_reservation_id and user_id = auth.uid();

  if target_group_id is null then
    raise exception 'Reservation not found or not yours';
  end if;

  if target_status = 'confirmed' then
    raise exception 'Your deposit is already held — use Request Mediation from the group to ask for a refund';
  end if;

  if target_status = 'cancelled' or target_status = 'refunded' then
    raise exception 'This reservation is already cancelled';
  end if;

  update public.reservations set status = 'cancelled' where id = p_reservation_id;

  delete from public.group_members
  where group_id = target_group_id and user_id = auth.uid() and role = 'prospective';
end;
$$;
