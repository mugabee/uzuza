-- Phase 6 — Event Contribution Feature

create type public.pledge_visibility as enum ('public', 'name_only', 'private');
create type public.pledge_status as enum ('pledged', 'submitted', 'confirmed', 'cancelled');

alter table public.groups add column pledge_goal numeric(12, 2);

create table public.event_pledges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  pledger_id uuid not null references auth.users (id),
  amount numeric(12, 2) not null,
  visibility public.pledge_visibility not null default 'public',
  status public.pledge_status not null default 'pledged',
  unique_reference text not null unique,
  transaction_id text,
  screenshot_path text,
  pledged_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz
);

create index event_pledges_group_id_idx on public.event_pledges (group_id);

alter table public.event_pledges enable row level security;

create policy "select own or admin pledges" on public.event_pledges
  for select using (
    pledger_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = event_pledges.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
  );

-- Payouts: extend to support events, which have no cycle. approve_payout
-- and complete_payout need no changes — they only ever look up group_id
-- and status from the payout_requests row itself.
alter table public.payout_requests alter column cycle_id drop not null;
alter table public.payout_requests add column event_group_id uuid references public.groups (id) on delete cascade;
alter table public.payout_requests add constraint payout_target_check
  check ((cycle_id is not null) <> (event_group_id is not null));
alter table public.payout_requests add constraint payout_requests_event_group_id_key unique (event_group_id);

create function public.create_pledge(
  p_group_id uuid,
  p_amount numeric,
  p_visibility public.pledge_visibility
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g_type public.group_type;
  new_pledge_id uuid;
begin
  select group_type into g_type from public.groups where id = p_group_id;
  if g_type is null then
    raise exception 'Group not found';
  end if;
  if g_type != 'event' then
    raise exception 'This group does not accept pledges';
  end if;
  if p_amount <= 0 then
    raise exception 'Enter an amount greater than 0';
  end if;

  insert into public.event_pledges (group_id, pledger_id, amount, visibility, unique_reference)
  values (
    p_group_id, auth.uid(), p_amount, p_visibility,
    'UZP-' || substr(p_group_id::text, 1, 6) || '-' || substr(auth.uid()::text, 1, 6) || '-' || substr(gen_random_uuid()::text, 1, 4)
  )
  returning id into new_pledge_id;

  return new_pledge_id;
end;
$$;

create function public.submit_pledge_proof(
  p_pledge_id uuid,
  p_transaction_id text,
  p_screenshot_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_pledges
  set status = 'submitted', transaction_id = p_transaction_id, screenshot_path = p_screenshot_path
  where id = p_pledge_id and pledger_id = auth.uid() and status = 'pledged';

  if not found then
    raise exception 'Pledge not found, not yours, or not pending payment';
  end if;
end;
$$;

create function public.confirm_pledge(p_pledge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  is_admin boolean;
begin
  select group_id into target_group_id from public.event_pledges where id = p_pledge_id;
  if target_group_id is null then
    raise exception 'Pledge not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a pledge';
  end if;

  update public.event_pledges
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_pledge_id and status = 'submitted';

  if not found then
    raise exception 'Pledge not found or not awaiting confirmation';
  end if;
end;
$$;

create function public.cancel_pledge(p_pledge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_pledges
  set status = 'cancelled'
  where id = p_pledge_id and pledger_id = auth.uid() and status = 'pledged';

  if not found then
    raise exception 'Pledge not found, not yours, or already paid — contact an admin instead';
  end if;
end;
$$;

-- Masked board: everyone gets name+amount for public pledges, name only
-- (amount hidden) for name_only, neither for private — except the
-- pledger's own row and the group's admins, who always see everything.
create function public.get_pledge_board(p_group_id uuid)
returns table (
  pledge_id uuid,
  display_name text,
  display_amount numeric,
  status public.pledge_status,
  is_own boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  viewer_is_admin boolean;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into viewer_is_admin;

  return query
  select
    ep.id,
    case
      when viewer_is_admin or ep.pledger_id = auth.uid() or ep.visibility in ('public', 'name_only')
        then coalesce(p.full_name, 'Someone')
      else null
    end,
    case
      when viewer_is_admin or ep.pledger_id = auth.uid() or ep.visibility = 'public'
        then ep.amount
      else null
    end,
    ep.status,
    ep.pledger_id = auth.uid()
  from public.event_pledges ep
  left join public.profiles p on p.id = ep.pledger_id
  where ep.group_id = p_group_id and ep.status != 'cancelled'
  order by ep.pledged_at desc;
end;
$$;

create function public.get_pledge_total(p_group_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(amount), 0) from public.event_pledges
  where group_id = p_group_id and status != 'cancelled';
$$;

create function public.request_event_payout(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  organizer uuid;
  total_amount numeric;
  new_request_id uuid;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can request the payout';
  end if;

  select created_by into organizer from public.groups where id = p_group_id;
  if organizer is null then
    raise exception 'Group not found';
  end if;

  select coalesce(sum(amount), 0) into total_amount
  from public.event_pledges where group_id = p_group_id and status = 'confirmed';

  if total_amount <= 0 then
    raise exception 'No confirmed pledges to pay out yet';
  end if;

  insert into public.payout_requests (event_group_id, group_id, recipient_user_id, amount, requested_by)
  values (p_group_id, p_group_id, organizer, total_amount, auth.uid())
  returning id into new_request_id;

  return new_request_id;
end;
$$;

-- create_group needs to accept the optional pledge goal. New param
-- appended at the end with a default, so this is a drop-in replacement.
create or replace function public.create_group(
  p_name text,
  p_group_type public.group_type,
  p_contribution_amount numeric,
  p_frequency text,
  p_target_size int,
  p_account_type public.account_type,
  p_rotation_method public.rotation_method,
  p_approval_threshold text,
  p_is_matching_group boolean default false,
  p_pledge_goal numeric default null
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
    account_type, rotation_method, approval_threshold, created_by,
    is_matching_group, status, pledge_goal
  )
  values (
    p_name, p_group_type, p_contribution_amount, p_frequency, p_target_size,
    p_account_type, p_rotation_method, p_approval_threshold, auth.uid(),
    p_is_matching_group,
    case when p_is_matching_group then 'forming'::public.group_status else 'active'::public.group_status end,
    p_pledge_goal
  )
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'admin');

  return new_group_id;
end;
$$;

-- Storage: same shape as the other proof buckets.
insert into storage.buckets (id, name, public)
values ('pledge-proofs', 'pledge-proofs', false)
on conflict (id) do nothing;

create policy "upload own pledge proof" on storage.objects
  for insert with check (
    bucket_id = 'pledge-proofs' and
    exists (
      select 1 from public.event_pledges ep
      where ep.id::text = (storage.foldername(name))[1] and ep.pledger_id = auth.uid()
    )
  );

create policy "read own or admin pledge proof" on storage.objects
  for select using (
    bucket_id = 'pledge-proofs' and
    exists (
      select 1 from public.event_pledges ep
      where ep.id::text = (storage.foldername(name))[1]
        and (
          ep.pledger_id = auth.uid()
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = ep.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
          )
        )
    )
  );
