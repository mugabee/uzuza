-- Section 3.7: "every member explicitly acknowledges before the group
-- activates." The acknowledgment table and RPC existed since Phase 4, but
-- nothing checked it — a matching group could fill and activate with
-- members who never opened the constitution. This wires it into the one
-- place "activation" is a real, gateable event: a matching group's
-- forming -> active transition (organic groups are born active at
-- creation, there is no equivalent moment to gate for them).
--
-- The last blocking condition to clear could be either an admin
-- confirming the final reservation, or a member acknowledging the
-- constitution after everything else was already ready — so the same
-- check needs to run from both places, not just one.

create function public.try_activate_matching_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_size int;
  total_members int;
  unconfirmed_prospectives int;
  unacknowledged_members int;
begin
  select g.target_size into target_size
  from public.groups g
  where g.id = p_group_id and g.status = 'forming';

  if target_size is null then
    return;
  end if;

  select count(*) into total_members
  from public.group_members where group_id = p_group_id;

  select count(*) into unconfirmed_prospectives
  from public.group_members gm
  where gm.group_id = p_group_id and gm.role = 'prospective'
    and not exists (
      select 1 from public.reservations r
      where r.group_id = gm.group_id and r.user_id = gm.user_id and r.status = 'confirmed'
    );

  select count(*) into unacknowledged_members
  from public.group_members gm
  where gm.group_id = p_group_id
    and not exists (
      select 1 from public.constitution_acknowledgments ca
      where ca.group_id = gm.group_id and ca.user_id = gm.user_id
    );

  if total_members >= target_size
     and unconfirmed_prospectives = 0
     and unacknowledged_members = 0 then
    update public.groups set status = 'active' where id = p_group_id;
    update public.group_members set role = 'member'
    where group_id = p_group_id and role = 'prospective';
  end if;
end;
$$;

create or replace function public.confirm_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  fee numeric;
  is_admin boolean;
begin
  select group_id, fee_amount into target_group_id, fee
  from public.reservations where id = p_reservation_id;

  if target_group_id is null then
    raise exception 'Reservation not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a reservation';
  end if;

  update public.reservations
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_reservation_id and status = 'submitted';

  if not found then
    raise exception 'Reservation not found or not awaiting confirmation';
  end if;

  insert into public.custody_ledger (group_id, reservation_id, amount)
  values (target_group_id, p_reservation_id, fee);

  perform public.try_activate_matching_group(target_group_id);
end;
$$;

create or replace function public.acknowledge_constitution(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can acknowledge the constitution';
  end if;

  insert into public.constitution_acknowledgments (group_id, user_id)
  values (p_group_id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  perform public.try_activate_matching_group(p_group_id);
end;
$$;
