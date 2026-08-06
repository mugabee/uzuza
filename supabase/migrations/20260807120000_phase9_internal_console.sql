-- Phase 9 — Internal Operations Console
--
-- staff_users is a platform-level authorization domain, entirely separate
-- from any group's member_role. No self-serve staff signup — granting
-- access is a direct-database action, same precedent as
-- platform_settings.custody_cap_amount since Phase 7.
create table public.staff_users (
  user_id uuid primary key references auth.users (id),
  added_at timestamptz not null default now()
);

create function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.staff_users where user_id = auth.uid());
$$;

create type public.mediation_stakes as enum ('financial', 'general');
alter table public.mediation_cases add column stakes public.mediation_stakes not null default 'general';

create type public.unmatched_payment_status as enum ('open', 'resolved');
create table public.unmatched_payments (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references auth.users (id),
  description text not null,
  amount numeric(12, 2),
  status public.unmatched_payment_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create type public.id_verification_status as enum ('pending', 'approved', 'rejected');
create table public.id_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  status public.id_verification_status not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz
);

alter table public.staff_users enable row level security;
alter table public.unmatched_payments enable row level security;
alter table public.id_verification_requests enable row level security;

create policy "staff can see the staff list" on public.staff_users
  for select using (public.is_staff());
create policy "staff can see unmatched payments" on public.unmatched_payments
  for select using (public.is_staff());
create policy "staff can see id verification requests" on public.id_verification_requests
  for select using (public.is_staff());

-- Extend request_mediation (same signature) to tag stakes automatically
-- from real state: a group currently holding uzuza_held custody, or with
-- a payout in flight that hasn't completed yet, is a financial dispute.
create or replace function public.request_mediation(p_group_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  computed_stakes public.mediation_stakes;
  g_account_type public.account_type;
  has_pending_payout boolean;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can request mediation';
  end if;

  select account_type into g_account_type from public.groups where id = p_group_id;
  select exists (
    select 1 from public.payout_requests
    where group_id = p_group_id and status != 'completed'
  ) into has_pending_payout;

  computed_stakes := case
    when g_account_type = 'uzuza_held' or has_pending_payout then 'financial'
    else 'general'
  end;

  insert into public.mediation_cases (group_id, raised_by, reason, stakes)
  values (p_group_id, auth.uid(), p_reason, computed_stakes)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.get_platform_metrics()
returns table (
  active_groups bigint,
  active_members bigint,
  custody_held numeric,
  custody_cap numeric,
  open_mediations_financial bigint,
  open_mediations_general bigint,
  pending_id_reviews bigint,
  open_unmatched_payments bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select
    (select count(*) from public.groups where status = 'active'),
    (select count(*) from public.group_members where membership_status = 'active'),
    (select coalesce(sum(amount), 0) from public.custody_ledger where swept_at is null),
    (select custody_cap_amount from public.platform_settings where id = 1),
    (select count(*) from public.mediation_cases where status = 'open' and stakes = 'financial'),
    (select count(*) from public.mediation_cases where status = 'open' and stakes = 'general'),
    (select count(*) from public.id_verification_requests where status = 'pending'),
    (select count(*) from public.unmatched_payments where status = 'open');
end;
$$;

create function public.list_mediation_cases()
returns table (
  id uuid, group_id uuid, group_name text, raised_by uuid, raiser_name text,
  reason text, stakes public.mediation_stakes, status public.mediation_status, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select mc.id, mc.group_id, g.name, mc.raised_by, p.full_name, mc.reason, mc.stakes, mc.status, mc.created_at
  from public.mediation_cases mc
  join public.groups g on g.id = mc.group_id
  left join public.profiles p on p.id = mc.raised_by
  order by (mc.stakes = 'financial') desc, mc.created_at asc;
end;
$$;

create function public.close_mediation_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.mediation_cases set status = 'closed' where id = p_case_id;
  if not found then
    raise exception 'Mediation case not found';
  end if;
end;
$$;

create function public.log_unmatched_payment(p_description text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  insert into public.unmatched_payments (reported_by, description, amount)
  values (auth.uid(), p_description, p_amount)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.resolve_unmatched_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.unmatched_payments
  set status = 'resolved', resolved_at = now()
  where id = p_id and status = 'open';

  if not found then
    raise exception 'Unmatched payment not found or already resolved';
  end if;
end;
$$;

create function public.list_id_verification_requests()
returns table (
  id uuid, user_id uuid, user_name text, status public.id_verification_status, requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select r.id, r.user_id, p.full_name, r.status, r.requested_at
  from public.id_verification_requests r
  left join public.profiles p on p.id = r.user_id
  order by r.requested_at asc;
end;
$$;

create function public.decide_id_verification(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.id_verification_requests
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.id_verification_status,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id and status = 'pending';

  if not found then
    raise exception 'Request not found or already decided';
  end if;
end;
$$;
