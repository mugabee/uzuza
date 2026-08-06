-- Phase 7 — Custody & Escrow Infrastructure
--
-- IMPORTANT: this is the technical half of Phase 7 only. CLAUDE.md's own
-- done-criterion for this phase requires legal review (Rwanda BNR) and a
-- real dedicated Uzuza business MoMo account, neither of which exists yet.
-- Nothing here has a production code path — the sweep-out cron route is
-- hardwired to MTN's sandbox regardless of env config. Do not treat this
-- migration as clearance to move real money.

create table public.platform_settings (
  id int primary key default 1,
  custody_cap_amount numeric(14, 2) not null,
  constraint platform_settings_singleton check (id = 1)
);
insert into public.platform_settings (id, custody_cap_amount) values (1, 5000000);

create table public.custody_consents (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  consented_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.custody_consents enable row level security;
create policy "select custody consents in your groups" on public.custody_consents
  for select using (public.is_group_member(group_id));

-- Generalize custody_ledger (Phase 5 only ever recorded reservations) to
-- also cover ongoing uzuza_held contributions, and to track sweep-out.
alter table public.custody_ledger alter column reservation_id drop not null;
alter table public.custody_ledger add column contribution_id uuid references public.contributions (id);
alter table public.custody_ledger add constraint custody_ledger_source_check
  check ((reservation_id is not null) <> (contribution_id is not null));
alter table public.custody_ledger add column swept_at timestamptz;
alter table public.custody_ledger add column swept_reference text;

alter table public.payout_requests add column swept_at timestamptz;

create function public.set_account_type(
  p_group_id uuid,
  p_account_type public.account_type,
  p_consent boolean default false
)
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
    raise exception 'Only a group admin can change the account type';
  end if;

  if p_account_type = 'uzuza_held' and not p_consent then
    raise exception 'Explicit consent is required to hold funds in Uzuza custody';
  end if;

  update public.groups set account_type = p_account_type where id = p_group_id;

  if p_account_type = 'uzuza_held' then
    insert into public.custody_consents (group_id, user_id)
    values (p_group_id, auth.uid())
    on conflict (group_id, user_id) do update set consented_at = now();
  end if;
end;
$$;

-- Extend confirm_contribution (same signature — drop-in replacement):
-- uzuza_held groups check the platform-wide cap before allowing
-- confirmation, and record a custody_ledger entry on success.
create or replace function public.confirm_contribution(
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
  g_account_type public.account_type;
  contribution_amount numeric;
  currently_held numeric;
  cap numeric;
begin
  select group_id, cycle_id, amount into target_group_id, target_cycle_id, contribution_amount
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

  select account_type into g_account_type from public.groups where id = target_group_id;

  if p_approve and g_account_type = 'uzuza_held' then
    select coalesce(sum(amount), 0) into currently_held
    from public.custody_ledger where swept_at is null;
    select custody_cap_amount into cap from public.platform_settings where id = 1;

    if currently_held + contribution_amount > cap then
      raise exception 'Platform custody cap reached — cannot hold this contribution right now';
    end if;
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

  if p_approve and g_account_type = 'uzuza_held' then
    insert into public.custody_ledger (group_id, contribution_id, amount)
    values (target_group_id, p_contribution_id, contribution_amount);
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

create function public.get_custody_reconciliation(p_group_id uuid)
returns table (
  entry_id uuid,
  source text,
  amount numeric,
  held_at timestamptz,
  swept_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can view custody reconciliation';
  end if;

  return query
  select
    cl.id,
    case when cl.reservation_id is not null then 'reservation' else 'contribution' end,
    cl.amount,
    cl.held_at,
    cl.swept_at
  from public.custody_ledger cl
  where cl.group_id = p_group_id
  order by cl.held_at desc;
end;
$$;
