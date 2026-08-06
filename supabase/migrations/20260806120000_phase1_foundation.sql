-- Phase 1 — Foundation: profiles, groups, group_members
-- Minimal slice of the data model in CLAUDE.md Section 6, scoped to what
-- "sign up, verify, create an empty group" needs. Full ledger/cycle/
-- contribution tables come in Phase 2.

create type public.group_type as enum ('rotating', 'event');
create type public.member_role as enum ('prospective', 'member', 'admin', 'witness');
create type public.account_type as enum ('group_owned', 'uzuza_held');
create type public.rotation_method as enum ('random', 'fixed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_type public.group_type not null,
  contribution_amount numeric(12, 2) not null,
  frequency text not null,
  target_size int not null,
  account_type public.account_type not null default 'group_owned',
  rotation_method public.rotation_method not null default 'random',
  approval_threshold text not null default '1',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index groups_created_by_idx on public.groups (created_by);
create index group_members_user_id_idx on public.group_members (user_id);

-- Auto-create a profile row whenever a new auth user signs up, so profile
-- creation can't be skipped by a client that forgets to call an API.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic group creation: inserts the group and its creator's admin
-- membership row together. Client code calls this RPC rather than
-- inserting into groups/group_members directly — keeps "no unilateral
-- admin edits" enforceable in code from the very first write path.
create function public.create_group(
  p_name text,
  p_group_type public.group_type,
  p_contribution_amount numeric,
  p_frequency text,
  p_target_size int,
  p_account_type public.account_type,
  p_rotation_method public.rotation_method,
  p_approval_threshold text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  insert into public.groups (
    name, group_type, contribution_amount, frequency, target_size,
    account_type, rotation_method, approval_threshold, created_by
  )
  values (
    p_name, p_group_type, p_contribution_amount, p_frequency, p_target_size,
    p_account_type, p_rotation_method, p_approval_threshold, auth.uid()
  )
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'admin');

  return new_group_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "select groups you belong to" on public.groups
  for select using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

create policy "select own membership rows" on public.group_members
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies on groups or group_members for the
-- authenticated role: all writes go through security-definer RPCs
-- (create_group today; approval/proposal RPCs in later phases).
