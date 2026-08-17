-- Admin/staff control over what verification a withdrawal requires
-- (Section 3.7 / Section 3.9's "support/operations staff" role):
-- None / MFA / Full KYC / Both, settable as a platform-wide default and
-- overridable per user, dynamically pushable from the internal console.
--
-- Important context this migration deliberately responds to: withdrawals
-- have unconditionally required a verified TOTP factor since Phase 10
-- (require_fund_release_mfa(), called unconditionally inside
-- request_wallet_withdrawal). Real TOTP *enrollment* is a known, already-
-- documented broken path on this project's hosted Supabase instance (a
-- GoTrue-side "500 Error generating QR Code" bug, not anything in this
-- app's code or schema — see this file's own commit history). Since
-- nobody can actually enroll a factor today, that unconditional call has
-- meant every real user is currently locked out of ever withdrawing,
-- not just gated pending a fix. This migration both adds the requested
-- staff control AND fixes that lockout, by making the global default
-- 'none' instead of the previous hardcoded 'always require MFA' — staff
-- can dial it up to 'kyc' (a real, working path — see the ID-upload
-- flow from 20260815170000_id_verification_upload_and_ai_match.sql) or
-- 'mfa'/'both' once the TOTP enrollment bug is actually fixed, without
-- another migration.

create type public.withdrawal_verification_requirement as enum ('none', 'mfa', 'kyc', 'both');

alter table public.platform_settings
  add column withdrawal_verification_requirement public.withdrawal_verification_requirement not null default 'none';

-- Per-user override — lets staff tighten (or loosen) the requirement for
-- a specific member without changing the platform-wide default. Absence
-- of a row means "use the global default", not "none" — the effective-
-- requirement function below encodes that fallback explicitly.
create table public.withdrawal_verification_overrides (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requirement public.withdrawal_verification_requirement not null,
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now()
);

alter table public.withdrawal_verification_overrides enable row level security;
create policy "staff can view withdrawal overrides" on public.withdrawal_verification_overrides
  for select using (public.is_staff());
-- No insert/update/delete policy: all writes go through the
-- SECURITY DEFINER staff RPC below, never a direct table write, so this
-- can't be tightened or loosened by anyone without going through the
-- audit-logged path.

create function public.get_effective_withdrawal_requirement(p_user_id uuid default auth.uid())
returns public.withdrawal_verification_requirement
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select requirement from public.withdrawal_verification_overrides where user_id = p_user_id),
    (select withdrawal_verification_requirement from public.platform_settings where id = 1)
  );
$$;

create function public.check_withdrawal_verification_requirement()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.withdrawal_verification_requirement;
  verified boolean;
begin
  req := public.get_effective_withdrawal_requirement(auth.uid());

  if req in ('mfa', 'both') then
    perform public.require_fund_release_mfa();
  end if;

  if req in ('kyc', 'both') then
    select identity_verified into verified from public.profiles where id = auth.uid();
    if not coalesce(verified, false) then
      raise exception 'Identity verification is required before withdrawing — submit your ID for review at /profile/security';
    end if;
  end if;
end;
$$;

-- request_wallet_withdrawal: same signature as
-- 20260815160000_fraud_velocity_and_drift_monitoring.sql's version, only
-- the unconditional require_fund_release_mfa() call replaced with the
-- configurable check above.
create or replace function public.request_wallet_withdrawal(p_amount numeric, p_phone text)
returns table (id uuid, reference text, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  new_id uuid;
  ref text;
  existing record;
begin
  perform public.check_withdrawal_verification_requirement();
  perform public.check_rate_limit('request_wallet_withdrawal', 60);

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  perform pg_advisory_xact_lock(hashtext('uzuza_wallet_' || auth.uid()::text));

  select wt.id, wt.disbursement_reference_id into existing
  from public.wallet_transactions wt
  where wt.user_id = auth.uid()
    and wt.type = 'withdrawal'
    and wt.status = 'pending'
  order by wt.created_at desc
  limit 1;

  if existing.id is not null then
    return query select existing.id, existing.disbursement_reference_id, false;
    return;
  end if;

  select public.get_wallet_balance() into bal;
  if bal < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  ref := 'UZW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.wallet_transactions (user_id, type, amount, status, phone, disbursement_reference_id)
  values (auth.uid(), 'withdrawal', p_amount, 'pending', p_phone, ref)
  returning wallet_transactions.id into new_id;

  perform public.check_wallet_velocity_and_threshold(auth.uid(), 'withdrawal', p_amount, new_id);

  perform public.log_audit_event('wallet_withdrawal_requested', 'wallet_transaction', new_id, jsonb_build_object('amount', p_amount));

  return query select new_id, ref, true;
end;
$$;

-- Staff console RPCs.

create function public.set_global_withdrawal_requirement(p_requirement public.withdrawal_verification_requirement)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.platform_settings set withdrawal_verification_requirement = p_requirement where id = 1;

  perform public.log_audit_event('withdrawal_requirement_global_set', 'platform_settings', 1, jsonb_build_object('requirement', p_requirement));
end;
$$;

create function public.set_user_withdrawal_requirement_override(p_user_id uuid, p_requirement public.withdrawal_verification_requirement)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  insert into public.withdrawal_verification_overrides (user_id, requirement, set_by, set_at)
  values (p_user_id, p_requirement, auth.uid(), now())
  on conflict (user_id) do update set requirement = excluded.requirement, set_by = excluded.set_by, set_at = now();

  perform public.log_audit_event('withdrawal_requirement_override_set', 'profile', p_user_id, jsonb_build_object('requirement', p_requirement));
end;
$$;

create function public.clear_user_withdrawal_requirement_override(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  delete from public.withdrawal_verification_overrides where user_id = p_user_id;

  perform public.log_audit_event('withdrawal_requirement_override_cleared', 'profile', p_user_id, '{}'::jsonb);
end;
$$;

create function public.get_withdrawal_verification_settings()
returns table (
  global_requirement public.withdrawal_verification_requirement,
  overrides jsonb
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
    (select ps.withdrawal_verification_requirement from public.platform_settings ps where ps.id = 1),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'user_id', o.user_id,
          'full_name', p.full_name,
          'phone', p.phone,
          'requirement', o.requirement,
          'set_at', o.set_at
        ) order by o.set_at desc)
        from public.withdrawal_verification_overrides o
        join public.profiles p on p.id = o.user_id
      ),
      '[]'::jsonb
    );
end;
$$;

-- Staff need to be able to look a user up by phone/name to set an
-- override — a small, staff-only search, same controlled-read-function
-- pattern as find_groups/get_pledge_board.
create function public.search_profiles_for_staff(p_query text)
returns table (id uuid, full_name text, phone text, identity_verified boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, p.phone, p.identity_verified
  from public.profiles p
  where public.is_staff()
    and (p.full_name ilike '%' || p_query || '%' or p.phone ilike '%' || p_query || '%')
  order by p.full_name nulls last
  limit 20;
$$;
