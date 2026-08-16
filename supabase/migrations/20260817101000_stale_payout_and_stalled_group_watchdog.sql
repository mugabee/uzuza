-- Closes a real, previously-disclosed gap: CLAUDE.md itself names
-- "stalled-group handling... needs a scheduled job... nothing in the
-- app runs on a schedule yet" — written before this project had any
-- scheduled jobs at all. It now has two (sweep-out, reconcile-momo),
-- and the reconcile-momo cron only ever checked MoMo-Collections-
-- channel rows (contributions/topups/withdrawals) — it never looked at
-- payout_requests or forming-group staleness. This is that check,
-- reusing the exact fraud_flags infrastructure already built rather
-- than inventing a parallel mechanism.
--
-- Pure monitoring: flag-only, no change to any money-moving RPC, no
-- change to existing behaviour for any user or admin. An approved
-- payout that never gets completed, or a matching group stuck
-- 'forming' with real reservation money already in Uzuza custody, are
-- both now surfaced to staff instead of sitting invisible.

alter table public.platform_settings
  add column payout_stale_hours int not null default 48,
  add column forming_group_stale_days int not null default 25;

create function public.run_staleness_check()
returns table (stale_payouts_flagged int, stalled_groups_flagged int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout_stale_hours int;
  v_forming_group_stale_days int;
  v_payout_count int := 0;
  v_group_count int := 0;
  r record;
begin
  if auth.role() <> 'service_role' and not public.is_staff() then
    raise exception 'Staff or a trusted server process is required';
  end if;

  select payout_stale_hours, forming_group_stale_days
  into v_payout_stale_hours, v_forming_group_stale_days
  from public.platform_settings where id = 1;

  -- Approved but never completed: the moment a payout became
  -- 'approved' is the latest approval that crossed the threshold, not
  -- created_at (which is when it was first *requested*).
  for r in
    select pr.id, pr.group_id, pr.amount, max(pa.approved_at) as approved_at
    from public.payout_requests pr
    join public.payout_approvals pa on pa.payout_request_id = pr.id
    where pr.status = 'approved'
    group by pr.id, pr.group_id, pr.amount
    having max(pa.approved_at) < now() - make_interval(hours => v_payout_stale_hours)
      and not exists (
        select 1 from public.fraud_flags f
        where f.flag_type = 'stale_approved_payout' and f.entity_id = pr.id and f.resolved_at is null
      )
  loop
    perform public.flag_suspicious_activity(
      'stale_approved_payout', null, 'payout_request', r.id, r.amount,
      jsonb_build_object('group_id', r.group_id, 'approved_at', r.approved_at, 'stale_hours_threshold', v_payout_stale_hours)
    );
    v_payout_count := v_payout_count + 1;
  end loop;

  -- Forming groups stuck open with real reservation money already
  -- collected: CLAUDE.md's own "~3-4 weeks" guidance for this exact
  -- scenario (Section 3.4's stalled-group handling item).
  for r in
    select g.id, g.name, g.created_at
    from public.groups g
    where g.status = 'forming' and g.is_matching_group
      and g.created_at < now() - make_interval(days => v_forming_group_stale_days)
      and not exists (
        select 1 from public.fraud_flags f
        where f.flag_type = 'stalled_forming_group' and f.entity_id = g.id and f.resolved_at is null
      )
  loop
    perform public.flag_suspicious_activity(
      'stalled_forming_group', null, 'group', r.id, null,
      jsonb_build_object('group_name', r.name, 'created_at', r.created_at, 'stale_days_threshold', v_forming_group_stale_days)
    );
    v_group_count := v_group_count + 1;
  end loop;

  return query select v_payout_count, v_group_count;
end;
$$;
