-- require_fund_release_mfa's error text was hardcoded to mention
-- "approving or completing a payout" — accurate when it only guarded
-- payout actions, but now it also guards wallet withdrawals, where that
-- wording is just confusing. Generalized; logic unchanged.
create or replace function public.require_fund_release_mfa()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_verified_mfa_factor() then
    raise exception 'Multi-factor authentication required — enroll a second factor at /profile/security before releasing funds';
  end if;
  if not public.session_is_aal2() then
    raise exception 'This session has not completed multi-factor verification — sign in again and complete the second-factor challenge';
  end if;
end;
$$;
