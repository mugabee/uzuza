-- Phase 3 — Payouts & Multi-Approval

create type public.payout_status as enum ('pending', 'approved', 'completed');

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id),
  amount numeric(12, 2) not null,
  status public.payout_status not null default 'pending',
  requested_by uuid not null references auth.users (id),
  transaction_id text,
  screenshot_path text,
  completed_by uuid references auth.users (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cycle_id)
);

create table public.payout_approvals (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null references public.payout_requests (id) on delete cascade,
  approved_by uuid not null references auth.users (id),
  approved_at timestamptz not null default now(),
  unique (payout_request_id, approved_by)
);

create index payout_requests_group_id_idx on public.payout_requests (group_id);
create index payout_approvals_request_id_idx on public.payout_approvals (payout_request_id);

alter table public.payout_requests enable row level security;
alter table public.payout_approvals enable row level security;

create policy "select payout requests in your groups" on public.payout_requests
  for select using (public.is_group_member(group_id));

create policy "select payout approvals in your groups" on public.payout_approvals
  for select using (
    exists (
      select 1 from public.payout_requests pr
      where pr.id = payout_approvals.payout_request_id
        and public.is_group_member(pr.group_id)
    )
  );

create function public.request_payout(p_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_recipient uuid;
  target_status public.cycle_status;
  total_amount numeric;
  is_admin boolean;
  new_request_id uuid;
begin
  select group_id, recipient_user_id, status
  into target_group_id, target_recipient, target_status
  from public.cycles where id = p_cycle_id;

  if target_group_id is null then
    raise exception 'Cycle not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can request a payout';
  end if;

  if target_status != 'completed' then
    raise exception 'Cycle is not completed yet';
  end if;

  select coalesce(sum(amount), 0) into total_amount
  from public.contributions
  where cycle_id = p_cycle_id and status = 'confirmed';

  insert into public.payout_requests (
    cycle_id, group_id, recipient_user_id, amount, requested_by
  ) values (
    p_cycle_id, target_group_id, target_recipient, total_amount, auth.uid()
  )
  returning id into new_request_id;

  return new_request_id;
end;
$$;

create function public.approve_payout(p_payout_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_status public.payout_status;
  is_admin boolean;
  threshold text;
  admin_count int;
  required_approvals int;
  current_approvals int;
begin
  select group_id, status into target_group_id, target_status
  from public.payout_requests where id = p_payout_request_id;

  if target_group_id is null then
    raise exception 'Payout request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can approve a payout';
  end if;

  if target_status != 'pending' then
    raise exception 'Payout request is not awaiting approval';
  end if;

  insert into public.payout_approvals (payout_request_id, approved_by)
  values (p_payout_request_id, auth.uid())
  on conflict (payout_request_id, approved_by) do nothing;

  select approval_threshold into threshold from public.groups where id = target_group_id;
  select count(*) into admin_count
  from public.group_members where group_id = target_group_id and role = 'admin';

  required_approvals := case threshold
    when '1' then 1
    when '2-of-3' then least(2, admin_count)
    when 'all' then admin_count
    else 1
  end;

  select count(*) into current_approvals
  from public.payout_approvals where payout_request_id = p_payout_request_id;

  if current_approvals >= required_approvals then
    update public.payout_requests set status = 'approved' where id = p_payout_request_id;
  end if;
end;
$$;

create function public.complete_payout(
  p_payout_request_id uuid,
  p_transaction_id text,
  p_screenshot_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  is_admin boolean;
begin
  select group_id into target_group_id
  from public.payout_requests where id = p_payout_request_id;

  if target_group_id is null then
    raise exception 'Payout request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can complete a payout';
  end if;

  update public.payout_requests
  set status = 'completed',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      completed_by = auth.uid(),
      completed_at = now()
  where id = p_payout_request_id and status = 'approved';

  if not found then
    raise exception 'Payout request not found or not yet approved';
  end if;
end;
$$;

-- Storage: private bucket for payout proof screenshots (admin-submitted,
-- unlike contribution-proofs which is member-submitted).
insert into storage.buckets (id, name, public)
values ('payout-proofs', 'payout-proofs', false)
on conflict (id) do nothing;

create policy "admin upload payout proof" on storage.objects
  for insert with check (
    bucket_id = 'payout-proofs' and
    exists (
      select 1 from public.payout_requests pr
      join public.group_members gm on gm.group_id = pr.group_id
      where pr.id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid() and gm.role = 'admin'
    )
  );

create policy "read payout proof in your groups" on storage.objects
  for select using (
    bucket_id = 'payout-proofs' and
    exists (
      select 1 from public.payout_requests pr
      where pr.id::text = (storage.foldername(name))[1]
        and public.is_group_member(pr.group_id)
    )
  );
