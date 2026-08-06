-- Phase 2 — Contributions & Ledger

alter table public.groups add column momo_number text;

create type public.cycle_status as enum ('active', 'completed');
create type public.contribution_status as enum ('pending', 'submitted', 'confirmed', 'rejected');

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  cycle_number int not null,
  status public.cycle_status not null default 'active',
  recipient_user_id uuid not null references auth.users (id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (group_id, cycle_number)
);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  member_id uuid not null references auth.users (id),
  unique_reference text not null unique,
  amount numeric(12, 2) not null,
  status public.contribution_status not null default 'pending',
  transaction_id text,
  screenshot_path text,
  submitted_at timestamptz,
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  rejected_reason text
);

create index cycles_group_id_idx on public.cycles (group_id);
create index contributions_cycle_id_idx on public.contributions (cycle_id);
create index contributions_member_id_idx on public.contributions (member_id);

-- Broaden group_members visibility: Phase 1 only allowed seeing your own
-- membership row. The ledger needs to show every member's contribution
-- status, so members need to see who else is in their groups.
drop policy "select own membership rows" on public.group_members;

create policy "select members of your groups" on public.group_members
  for select using (
    group_id in (
      select gm.group_id from public.group_members gm where gm.user_id = auth.uid()
    )
  );

create policy "select contributions in your groups" on public.contributions
  for select using (
    group_id in (
      select gm.group_id from public.group_members gm where gm.user_id = auth.uid()
    )
  );

create policy "select cycles in your groups" on public.cycles
  for select using (
    group_id in (
      select gm.group_id from public.group_members gm where gm.user_id = auth.uid()
    )
  );

alter table public.cycles enable row level security;
alter table public.contributions enable row level security;

-- Join an existing group. No admin approval for organic groups in v1 —
-- the anchor-admin/reputation/consent gating in the plan applies to
-- stranger-matched groups (Phase 5), not this direct join-by-link flow.
create function public.join_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count int;
  group_target_size int;
begin
  if exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'Already a member of this group';
  end if;

  select target_size into group_target_size from public.groups where id = p_group_id;
  if group_target_size is null then
    raise exception 'Group not found';
  end if;

  select count(*) into member_count from public.group_members where group_id = p_group_id;
  if member_count >= group_target_size then
    raise exception 'Group is full';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, auth.uid(), 'member');
end;
$$;

-- Random draw for this cycle's recipient, generates one contribution row
-- per current member with a unique payment reference.
create function public.start_cycle(p_group_id uuid)
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
    insert into public.contributions (
      cycle_id, group_id, member_id, unique_reference, amount
    ) values (
      new_cycle_id,
      p_group_id,
      member_row.user_id,
      'UZ-' || substr(p_group_id::text, 1, 6) || '-' || next_cycle_number || '-' || substr(member_row.user_id::text, 1, 6),
      group_amount
    );
  end loop;

  return new_cycle_id;
end;
$$;

create function public.submit_contribution_proof(
  p_contribution_id uuid,
  p_transaction_id text,
  p_screenshot_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contributions
  set status = 'submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      submitted_at = now()
  where id = p_contribution_id
    and member_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Contribution not found, not yours, or not pending';
  end if;
end;
$$;

create function public.confirm_contribution(
  p_contribution_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  is_admin boolean;
  remaining_unconfirmed int;
begin
  select group_id, cycle_id into target_group_id, target_cycle_id
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm contributions';
  end if;

  if p_approve then
    update public.contributions
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'submitted';
  else
    update public.contributions
    set status = 'pending',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'submitted';
  end if;

  if not found then
    raise exception 'Contribution not found or not awaiting confirmation';
  end if;

  select count(*) into remaining_unconfirmed
  from public.contributions
  where cycle_id = target_cycle_id and status != 'confirmed';

  if remaining_unconfirmed = 0 then
    update public.cycles set status = 'completed', completed_at = now()
    where id = target_cycle_id;
  end if;
end;
$$;

-- Storage: private bucket for contribution proof screenshots.
insert into storage.buckets (id, name, public)
values ('contribution-proofs', 'contribution-proofs', false)
on conflict (id) do nothing;

create policy "upload own contribution proof" on storage.objects
  for insert with check (
    bucket_id = 'contribution-proofs' and
    exists (
      select 1 from public.contributions c
      where c.id::text = (storage.foldername(name))[1]
        and c.member_id = auth.uid()
    )
  );

create policy "read own or admin contribution proof" on storage.objects
  for select using (
    bucket_id = 'contribution-proofs' and
    exists (
      select 1 from public.contributions c
      where c.id::text = (storage.foldername(name))[1]
        and (
          c.member_id = auth.uid()
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = c.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
          )
        )
    )
  );
