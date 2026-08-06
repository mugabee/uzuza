-- Bug found during test design, not in production: the original check
-- ("has THIS cycle's payout already completed?") is structurally
-- unreachable — a cycle can't complete while one of its contributions is
-- still unconfirmed, so a payout can never exist yet for a cycle that
-- still has a pending/submitted contribution to report as missed. The
-- real question Section 3.7 is asking is "has THIS MEMBER already
-- received a payout at some point in this group's history" (e.g. they
-- got their turn in cycle 1, then missed a payment in cycle 3) — the
-- same check request_exit already uses correctly. Same signature, safe
-- to replace.
create or replace function public.report_missed_payment(p_contribution_id uuid, p_fine_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_cycle_id uuid;
  target_member_id uuid;
  is_admin boolean;
  recipient_paid boolean;
  fund_type public.safety_fund_type;
  fund_balance numeric;
  member_amount numeric;
begin
  select group_id, cycle_id, member_id, amount
  into target_group_id, target_cycle_id, target_member_id, member_amount
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
    select 1 from public.cycles c
    join public.payout_requests pr on pr.cycle_id = c.id
    where c.group_id = target_group_id
      and pr.recipient_user_id = target_member_id
      and pr.status = 'completed'
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
