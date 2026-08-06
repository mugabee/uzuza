-- Phase 5 — Matching & Trust Layer (scoped to the phase's actual
-- done-criterion: find a group, reserve with automatic custody, chat while
-- forming, activate once full — see CLAUDE.md Section 3.4 for what's
-- deliberately deferred: NIDA, reputation, tiered limits, full custody
-- caps/sweep-out, block-a-user, stalled-group auto-refund).

create type public.group_status as enum ('forming', 'active');
create type public.reservation_status as enum ('pending', 'submitted', 'confirmed', 'refunded');

-- Default 'active' means every existing row from Phases 1-4 keeps working
-- unchanged — Postgres applies a column default to existing rows without
-- a full rewrite, so this is a safe additive change, not a backfill.
alter table public.groups add column status public.group_status not null default 'active';
alter table public.groups add column is_matching_group boolean not null default false;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  fee_amount numeric(12, 2) not null,
  status public.reservation_status not null default 'pending',
  unique_reference text not null unique,
  transaction_id text,
  screenshot_path text,
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  unique (group_id, user_id)
);

create table public.custody_ledger (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id),
  amount numeric(12, 2) not null,
  held_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references auth.users (id),
  body text not null,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

-- Traceability from a reservation into the contribution it converted into
-- (Section 3.4: "reservation converts to first contribution").
alter table public.contributions add column reservation_id uuid references public.reservations (id);

create index reservations_group_id_idx on public.reservations (group_id);
create index custody_ledger_group_id_idx on public.custody_ledger (group_id);
create index chat_messages_group_id_idx on public.chat_messages (group_id);

alter table public.reservations enable row level security;
alter table public.custody_ledger enable row level security;
alter table public.chat_messages enable row level security;

create policy "browse open matching groups" on public.groups
  for select using (is_matching_group and status = 'forming');

create policy "select reservations in your groups" on public.reservations
  for select using (public.is_group_member(group_id));

create policy "select custody ledger in your groups" on public.custody_ledger
  for select using (public.is_group_member(group_id));

create policy "select chat in your groups" on public.chat_messages
  for select using (public.is_group_member(group_id));

create function public.find_groups()
returns setof public.groups
language sql
security definer
set search_path = public
stable
as $$
  select g.* from public.groups g
  where g.is_matching_group and g.status = 'forming'
    and (select count(*) from public.group_members gm where gm.group_id = g.id) < g.target_size;
$$;

create function public.reserve_spot(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  member_count int;
  fee numeric;
  new_reservation_id uuid;
begin
  select * into g from public.groups where id = p_group_id;
  if g.id is null then
    raise exception 'Group not found';
  end if;
  if not g.is_matching_group or g.status != 'forming' then
    raise exception 'This group is not open for reservations';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) then
    raise exception 'Already in this group';
  end if;

  select count(*) into member_count from public.group_members where group_id = p_group_id;
  if member_count >= g.target_size then
    raise exception 'Group is full';
  end if;

  fee := least(g.contribution_amount * 0.05, 50000);

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, auth.uid(), 'prospective');

  insert into public.reservations (group_id, user_id, fee_amount, unique_reference)
  values (
    p_group_id, auth.uid(), fee,
    'UZR-' || substr(p_group_id::text, 1, 6) || '-' || substr(auth.uid()::text, 1, 6)
  )
  returning id into new_reservation_id;

  return new_reservation_id;
end;
$$;

create function public.submit_reservation_proof(
  p_reservation_id uuid,
  p_transaction_id text,
  p_screenshot_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservations
  set status = 'submitted', transaction_id = p_transaction_id, screenshot_path = p_screenshot_path
  where id = p_reservation_id and user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'Reservation not found, not yours, or not pending';
  end if;
end;
$$;

create function public.confirm_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  fee numeric;
  is_admin boolean;
  total_members int;
  unconfirmed_prospectives int;
  target_size int;
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

  select g.target_size into target_size from public.groups g where g.id = target_group_id;
  select count(*) into total_members from public.group_members where group_id = target_group_id;
  select count(*) into unconfirmed_prospectives
  from public.group_members gm
  where gm.group_id = target_group_id and gm.role = 'prospective'
    and not exists (
      select 1 from public.reservations r
      where r.group_id = gm.group_id and r.user_id = gm.user_id and r.status = 'confirmed'
    );

  if total_members >= target_size and unconfirmed_prospectives = 0 then
    update public.groups set status = 'active' where id = target_group_id;
    update public.group_members set role = 'member'
    where group_id = target_group_id and role = 'prospective';
  end if;
end;
$$;

create function public.send_chat_message(p_group_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_status public.group_status;
  new_message_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can send chat messages';
  end if;

  select status into g_status from public.groups where id = p_group_id;
  if g_status != 'forming' then
    raise exception 'Chat is only available while the group is forming';
  end if;

  if length(trim(p_body)) = 0 or length(p_body) > 500 then
    raise exception 'Message must be 1-500 characters';
  end if;

  if p_body ~* '(https?://|www\.)' then
    raise exception 'Links are not allowed in chat';
  end if;

  if exists (
    select 1 from public.chat_messages
    where group_id = p_group_id and sender_id = auth.uid()
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Sending too fast — please wait a moment';
  end if;

  insert into public.chat_messages (group_id, sender_id, body)
  values (p_group_id, auth.uid(), p_body)
  returning id into new_message_id;

  return new_message_id;
end;
$$;

create function public.flag_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
begin
  select group_id into target_group_id from public.chat_messages where id = p_message_id;
  if target_group_id is null then
    raise exception 'Message not found';
  end if;
  if not public.is_group_member(target_group_id) then
    raise exception 'Only group members can flag messages';
  end if;

  update public.chat_messages set flagged = true where id = p_message_id;
end;
$$;

-- Extend start_cycle: a matching group's first cycle should treat an
-- already-confirmed reservation as that member's first contribution
-- (Section 3.4: "reservation converts to first contribution"), not a
-- fresh pending one. Same signature, so this is a drop-in replacement.
create or replace function public.start_cycle(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  next_cycle_number int;
  new_cycle_id uuid;
  chosen_recipient uuid;
  group_amount numeric;
  member_row record;
  matching_reservation record;
  remaining_unconfirmed int;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can start a cycle';
  end if;

  if exists (
    select 1 from public.cycles where group_id = p_group_id and status = 'active'
  ) then
    raise exception 'This group already has an active cycle';
  end if;

  select coalesce(max(cycle_number), 0) + 1 into next_cycle_number
  from public.cycles where group_id = p_group_id;

  select user_id into chosen_recipient
  from public.group_members
  where group_id = p_group_id
  order by random()
  limit 1;

  if chosen_recipient is null then
    raise exception 'Group has no members yet';
  end if;

  select contribution_amount into group_amount from public.groups where id = p_group_id;

  insert into public.cycles (group_id, cycle_number, recipient_user_id)
  values (p_group_id, next_cycle_number, chosen_recipient)
  returning id into new_cycle_id;

  for member_row in
    select user_id from public.group_members where group_id = p_group_id
  loop
    matching_reservation := null;
    if next_cycle_number = 1 then
      select id, transaction_id, screenshot_path into matching_reservation
      from public.reservations
      where group_id = p_group_id and user_id = member_row.user_id and status = 'confirmed';
    end if;

    if matching_reservation.id is not null then
      insert into public.contributions (
        cycle_id, group_id, member_id, unique_reference, amount,
        status, transaction_id, screenshot_path, submitted_at, confirmed_at, reservation_id
      ) values (
        new_cycle_id, p_group_id, member_row.user_id,
        'UZ-' || substr(p_group_id::text, 1, 6) || '-' || next_cycle_number || '-' || substr(member_row.user_id::text, 1, 6),
        group_amount, 'confirmed', matching_reservation.transaction_id, matching_reservation.screenshot_path,
        now(), now(), matching_reservation.id
      );
    else
      insert into public.contributions (
        cycle_id, group_id, member_id, unique_reference, amount
      ) values (
        new_cycle_id, p_group_id, member_row.user_id,
        'UZ-' || substr(p_group_id::text, 1, 6) || '-' || next_cycle_number || '-' || substr(member_row.user_id::text, 1, 6),
        group_amount
      );
    end if;
  end loop;

  select count(*) into remaining_unconfirmed
  from public.contributions where cycle_id = new_cycle_id and status != 'confirmed';

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now() where id = new_cycle_id;
  end if;

  return new_cycle_id;
end;
$$;

-- Storage: same shape as contribution-proofs, for reservation fee proof.
insert into storage.buckets (id, name, public)
values ('reservation-proofs', 'reservation-proofs', false)
on conflict (id) do nothing;

create policy "upload own reservation proof" on storage.objects
  for insert with check (
    bucket_id = 'reservation-proofs' and
    exists (
      select 1 from public.reservations r
      where r.id::text = (storage.foldername(name))[1] and r.user_id = auth.uid()
    )
  );

create policy "read own or admin reservation proof" on storage.objects
  for select using (
    bucket_id = 'reservation-proofs' and
    exists (
      select 1 from public.reservations r
      where r.id::text = (storage.foldername(name))[1]
        and (
          r.user_id = auth.uid()
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = r.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
          )
        )
    )
  );
