-- The cycle a missed contribution belongs to may already be completed and
-- paid out by the time someone pays late, so this deliberately does not
-- touch the original cycle/payout math (request_payout already correctly
-- excluded the missed amount from that payout, and that's historically
-- accurate — it wasn't paid in time). Paying late is instead about the
-- member making it right and staying in good standing: the amount owed
-- (the original contribution plus the fine set when it was reported)
-- goes into the group's safety fund, the same pool Section 3.7 already
-- uses to absorb exactly this kind of shortfall, and the contribution
-- record moves to a real terminal status ('paid_late') instead of being
-- stuck at 'missed' forever with no way to resolve it.
--
-- Same two-step discipline as every other payment in the app: a member
-- submits proof, an admin has to explicitly confirm it — never confirmed
-- from a screenshot alone.

create function public.submit_late_payment_proof(
  p_contribution_id uuid,
  p_transaction_id text,
  p_screenshot_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('submit_late_payment_proof', 5);

  update public.contributions
  set status = 'late_submitted',
      transaction_id = p_transaction_id,
      screenshot_path = p_screenshot_path,
      submitted_at = now()
  where id = p_contribution_id
    and member_id = auth.uid()
    and status = 'missed';

  if not found then
    raise exception 'Contribution not found, not yours, or not awaiting a late payment';
  end if;
end;
$$;

create function public.confirm_late_payment(p_contribution_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  is_admin boolean;
  owed_amount numeric;
  fine_amount numeric;
begin
  select group_id, amount, coalesce(missed_fine_amount, 0)
  into target_group_id, owed_amount, fine_amount
  from public.contributions where id = p_contribution_id;

  if target_group_id is null then
    raise exception 'Contribution not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can confirm a late payment';
  end if;

  if p_approve then
    update public.contributions
    set status = 'paid_late', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;

    update public.groups
    set safety_fund_balance = safety_fund_balance + owed_amount + fine_amount
    where id = target_group_id;

    perform public.log_audit_event('late_payment_confirmed', 'contribution', p_contribution_id, jsonb_build_object('amount', owed_amount, 'fine_amount', fine_amount));
  else
    update public.contributions
    set status = 'missed',
        rejected_reason = p_reason,
        transaction_id = null,
        screenshot_path = null,
        submitted_at = null
    where id = p_contribution_id and status = 'late_submitted';

    if not found then
      raise exception 'Contribution not found or not awaiting confirmation';
    end if;
  end if;
end;
$$;
