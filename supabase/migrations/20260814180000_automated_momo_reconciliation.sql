-- Automated MoMo reconciliation — CLAUDE.md's own Section 3.7 names this
-- a post-launch item ("ahead of full automated MoMo statement matching"),
-- and the unmatched-payments page says the same thing explicitly. This
-- builds it: a daily job that compares Uzuza's internal payment records
-- against MTN MoMo's real transaction status for every reference Uzuza
-- itself generated, for the three flows that have a real, queryable
-- reference ID (MoMo Collections contributions, wallet top-ups, wallet
-- withdrawals). momo_manual/international_manual/momo_remittance stay
-- out of scope here on purpose — those are proof-submitted by a human,
-- not API-initiated by Uzuza, so there's no reference ID Uzuza controls
-- to look up automatically.
--
-- Two different outcomes depending on what's found:
--   - Safe to self-heal automatically (MoMo shows a real terminal status
--     that the internal record just never picked up — the confirmation
--     webhook/poll never landed): call the same confirm RPC a real
--     confirmation would have called, so it's the exact same code path,
--     not a special case.
--   - Never auto-resolved, always flagged for a human: anything where
--     the internal record says money moved and MoMo disagrees. Silently
--     "fixing" that automatically (e.g. reversing a confirmed
--     contribution, or crediting a wallet back after a failed
--     withdrawal) is exactly the kind of thing that should never happen
--     without a person looking at it first.

create type public.reconciliation_source as enum ('contribution', 'wallet_topup', 'wallet_withdrawal');

create type public.reconciliation_discrepancy_type as enum (
  'missing_confirmation',
  'false_confirmation',
  'phantom_debit',
  'stuck_pending'
);

create table public.reconciliation_discrepancies (
  id uuid primary key default gen_random_uuid(),
  source public.reconciliation_source not null,
  source_id uuid not null,
  reference_id text not null,
  discrepancy_type public.reconciliation_discrepancy_type not null,
  internal_status text not null,
  momo_status text not null,
  amount numeric(12, 2),
  auto_resolved boolean not null default false,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  resolution_note text
);

create index reconciliation_discrepancies_unresolved_idx
  on public.reconciliation_discrepancies (detected_at desc)
  where resolved_at is null;

alter table public.reconciliation_discrepancies enable row level security;
-- No client policies at all — every read/write goes through the
-- SECURITY DEFINER functions below (service-role for writes from the
-- cron job, staff-only for reads/resolution), same pattern as every
-- other internal-ops table in this app.

create function public.record_reconciliation_discrepancy(
  p_source public.reconciliation_source,
  p_source_id uuid,
  p_reference_id text,
  p_discrepancy_type public.reconciliation_discrepancy_type,
  p_internal_status text,
  p_momo_status text,
  p_amount numeric,
  p_auto_resolved boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'This function can only be called by a trusted server process';
  end if;

  insert into public.reconciliation_discrepancies
    (source, source_id, reference_id, discrepancy_type, internal_status, momo_status, amount, auto_resolved, resolved_at)
  values (
    p_source, p_source_id, p_reference_id, p_discrepancy_type, p_internal_status, p_momo_status, p_amount,
    p_auto_resolved, case when p_auto_resolved then now() else null end
  )
  returning id into v_id;

  perform public.log_audit_event(
    case when p_auto_resolved then 'reconciliation_discrepancy_auto_resolved' else 'reconciliation_discrepancy_detected' end,
    p_source::text, p_source_id,
    jsonb_build_object('type', p_discrepancy_type, 'internal_status', p_internal_status, 'momo_status', p_momo_status, 'reference_id', p_reference_id)
  );

  return v_id;
end;
$$;

create function public.list_reconciliation_discrepancies(p_unresolved_only boolean default true)
returns setof public.reconciliation_discrepancies
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
  select * from public.reconciliation_discrepancies
  where (not p_unresolved_only) or resolved_at is null
  order by detected_at desc
  limit 200;
end;
$$;

create function public.resolve_reconciliation_discrepancy(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.reconciliation_discrepancies
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
  where id = p_id and resolved_at is null;

  if not found then
    raise exception 'Discrepancy not found or already resolved';
  end if;

  perform public.log_audit_event('reconciliation_discrepancy_resolved', 'reconciliation_discrepancy', p_id, jsonb_build_object('note', p_note));
end;
$$;
