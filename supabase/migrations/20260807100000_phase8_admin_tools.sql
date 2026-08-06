-- Phase 8 — Admin Tools & Exit Handling

create type public.membership_status as enum ('active', 'paused', 'exited', 'removed');
alter table public.group_members add column membership_status public.membership_status not null default 'active';

create type public.safety_fund_type as enum ('off', 'buffer', 'freeze');
alter table public.groups add column safety_fund_type public.safety_fund_type not null default 'off';
alter table public.groups add column safety_fund_balance numeric(12, 2) not null default 0;

alter type public.contribution_status add value 'missed';

alter table public.contributions add column missed_fine_amount numeric(12, 2);

create type public.proposal_change_type as enum ('settings', 'role_change');
create type public.proposal_status as enum ('pending', 'applied', 'rejected');

create table public.group_change_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  proposed_by uuid not null references auth.users (id),
  change_type public.proposal_change_type not null,
  payload jsonb not null,
  status public.proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table public.proposal_approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.group_change_proposals (id) on delete cascade,
  approved_by uuid not null references auth.users (id),
  approved_at timestamptz not null default now(),
  unique (proposal_id, approved_by)
);

create type public.pause_status as enum ('pending', 'approved', 'rejected');
create table public.pause_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  reason text,
  status public.pause_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz
);

create type public.exit_status as enum ('pending', 'agreed', 'cancelled');
create table public.exit_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  fine_amount numeric(12, 2) not null default 0,
  safety_fund_draw numeric(12, 2) not null default 0,
  summary text not null,
  status public.exit_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz
);

create type public.mediation_status as enum ('open', 'closed');
create table public.mediation_cases (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  raised_by uuid not null references auth.users (id),
  reason text not null,
  status public.mediation_status not null default 'open',
  created_at timestamptz not null default now()
);

create index group_change_proposals_group_id_idx on public.group_change_proposals (group_id);
create index proposal_approvals_proposal_id_idx on public.proposal_approvals (proposal_id);
create index pause_requests_group_id_idx on public.pause_requests (group_id);
create index exit_requests_group_id_idx on public.exit_requests (group_id);
create index mediation_cases_group_id_idx on public.mediation_cases (group_id);

alter table public.group_change_proposals enable row level security;
alter table public.proposal_approvals enable row level security;
alter table public.pause_requests enable row level security;
alter table public.exit_requests enable row level security;
alter table public.mediation_cases enable row level security;

create policy "select proposals in your groups" on public.group_change_proposals
  for select using (public.is_group_member(group_id));
create policy "select proposal approvals in your groups" on public.proposal_approvals
  for select using (
    exists (
      select 1 from public.group_change_proposals p
      where p.id = proposal_approvals.proposal_id and public.is_group_member(p.group_id)
    )
  );
create policy "select pause requests in your groups" on public.pause_requests
  for select using (public.is_group_member(group_id));
create policy "select exit requests in your groups" on public.exit_requests
  for select using (public.is_group_member(group_id));
create policy "select mediation cases in your groups" on public.mediation_cases
  for select using (public.is_group_member(group_id));

-- === Group-change proposals (settings + admin succession) ===

create function public.propose_group_change(
  p_group_id uuid,
  p_change_type public.proposal_change_type,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  new_id uuid;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can propose a change';
  end if;

  insert into public.group_change_proposals (group_id, proposed_by, change_type, payload)
  values (p_group_id, auth.uid(), p_change_type, p_payload)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.approve_group_change(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_status public.proposal_status;
  target_payload jsonb;
  target_change_type public.proposal_change_type;
  target_created_at timestamptz;
  is_admin boolean;
  threshold text;
  admin_count int;
  required_approvals int;
  current_approvals int;
  should_apply boolean := false;
begin
  select group_id, status, payload, change_type, created_at
  into target_group_id, target_status, target_payload, target_change_type, target_created_at
  from public.group_change_proposals where id = p_proposal_id;

  if target_group_id is null then
    raise exception 'Proposal not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can approve a proposal';
  end if;

  if target_status != 'pending' then
    raise exception 'Proposal is not pending';
  end if;

  insert into public.proposal_approvals (proposal_id, approved_by)
  values (p_proposal_id, auth.uid())
  on conflict (proposal_id, approved_by) do nothing;

  select approval_threshold into threshold from public.groups where id = target_group_id;
  select count(*) into admin_count
  from public.group_members where group_id = target_group_id and role = 'admin';
  select count(*) into current_approvals
  from public.proposal_approvals where proposal_id = p_proposal_id;

  required_approvals := case threshold
    when '1' then 1
    when '2-of-3' then least(2, admin_count)
    when 'all' then admin_count
    else 1
  end;

  -- Section 3.7: apply once the configured threshold is met, OR once 5
  -- days have passed with at least a majority of current admins on board
  -- (covers an unreachable admin blocking a proposal indefinitely).
  if current_approvals >= required_approvals then
    should_apply := true;
  elsif now() > target_created_at + interval '5 days'
        and current_approvals * 2 > admin_count then
    should_apply := true;
  end if;

  if not should_apply then
    return;
  end if;

  if target_change_type = 'settings' then
    update public.groups set
      contribution_amount = coalesce((target_payload->>'contribution_amount')::numeric, contribution_amount),
      target_size = coalesce((target_payload->>'target_size')::int, target_size),
      approval_threshold = coalesce(target_payload->>'approval_threshold', approval_threshold),
      momo_number = coalesce(target_payload->>'momo_number', momo_number)
    where id = target_group_id;
  elsif target_change_type = 'role_change' then
    update public.group_members
    set role = (target_payload->>'new_role')::public.member_role
    where group_id = target_group_id and user_id = (target_payload->>'target_user_id')::uuid;
  end if;

  update public.group_change_proposals
  set status = 'applied', applied_at = now()
  where id = p_proposal_id;
end;
$$;

-- === Missed payments ===

create function public.report_missed_payment(p_contribution_id uuid, p_fine_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  is_admin boolean;
  recipient_paid boolean;
  fund_type public.safety_fund_type;
  fund_balance numeric;
  member_amount numeric;
begin
  select group_id, cycle_id, amount into target_group_id, target_cycle_id, member_amount
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can report a missed payment';
  end if;

  update public.contributions
  set status = 'missed', missed_fine_amount = p_fine_amount
  where id = p_contribution_id and status in ('pending', 'submitted');

  if not found then
    raise exception 'Contribution not found or already resolved';
  end if;

  select exists (
    select 1 from public.payout_requests
    where cycle_id = target_cycle_id and status = 'completed'
  ) into recipient_paid;

  if recipient_paid then
    select safety_fund_type, safety_fund_balance into fund_type, fund_balance
    from public.groups where id = target_group_id;

    if fund_type != 'off' and fund_balance >= member_amount then
      update public.groups
      set safety_fund_balance = safety_fund_balance - member_amount
      where id = target_group_id;
    end if;
    -- If the fund can't cover it, the contribution stays 'missed' with no
    -- further automatic action — Section 3.7 calls for an explicit group
    -- decision at that point, not a silent write.
  end if;
end;
$$;

create function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can remove a member';
  end if;

  update public.group_members
  set membership_status = 'removed'
  where group_id = p_group_id and user_id = p_user_id;

  if not found then
    raise exception 'Member not found in this group';
  end if;
end;
$$;

-- === Pause requests ===

create function public.request_pause(p_group_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can request a pause';
  end if;

  insert into public.pause_requests (group_id, user_id, reason)
  values (p_group_id, auth.uid(), p_reason)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.decide_pause(p_pause_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  is_admin boolean;
begin
  select group_id, user_id into target_group_id, target_user_id
  from public.pause_requests where id = p_pause_request_id;

  if target_group_id is null then
    raise exception 'Pause request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can decide a pause request';
  end if;

  update public.pause_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_pause_request_id and status = 'pending';

  if not found then
    raise exception 'Pause request not found or already decided';
  end if;

  if p_approve then
    update public.group_members
    set membership_status = 'paused'
    where group_id = target_group_id and user_id = target_user_id;
  end if;
end;
$$;

-- === Exit with Dignity ===

create function public.request_exit(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  has_received boolean;
  incomplete_rotation boolean;
  fine numeric := 0;
  contribution_amount_val numeric;
  summary_text text;
  new_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can request to exit';
  end if;

  select exists (
    select 1 from public.cycles c
    join public.payout_requests pr on pr.cycle_id = c.id
    where c.group_id = p_group_id and pr.recipient_user_id = auth.uid() and pr.status = 'completed'
  ) into has_received;

  -- Simplified fine model, documented as such: flat one contribution's
  -- worth if they've received the pot and the group hasn't finished a
  -- full rotation since (an active cycle still running counts as
  -- "not yet finished") — not a precise amortization.
  select exists (
    select 1 from public.cycles where group_id = p_group_id and status = 'active'
  ) into incomplete_rotation;

  select contribution_amount into contribution_amount_val from public.groups where id = p_group_id;

  if has_received and incomplete_rotation then
    fine := contribution_amount_val;
  end if;

  summary_text := case
    when fine > 0 then
      'Exit Agreement: you have received a payout from this group and the rotation is still in progress. ' ||
      'A fine of ' || fine || ' RWF applies, covering your remaining obligation to the group.'
    else
      'Exit Agreement: you have not received a payout from this group, or the rotation is already complete. No fine applies.'
  end;

  insert into public.exit_requests (group_id, user_id, fine_amount, summary)
  values (p_group_id, auth.uid(), fine, summary_text)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.decide_exit(p_exit_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  is_admin boolean;
begin
  select group_id, user_id into target_group_id, target_user_id
  from public.exit_requests where id = p_exit_request_id;

  if target_group_id is null then
    raise exception 'Exit request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can decide an exit request';
  end if;

  update public.exit_requests
  set status = case when p_approve then 'agreed' else 'cancelled' end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_exit_request_id and status = 'pending';

  if not found then
    raise exception 'Exit request not found or already decided';
  end if;

  if p_approve then
    update public.group_members
    set membership_status = 'exited'
    where group_id = target_group_id and user_id = target_user_id;
  end if;
end;
$$;

-- === Mediation ===

create function public.request_mediation(p_group_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can request mediation';
  end if;

  insert into public.mediation_cases (group_id, raised_by, reason)
  values (p_group_id, auth.uid(), p_reason)
  returning id into new_id;

  return new_id;
end;
$$;
