-- Deliberately a separate RPC rather than another create_group parameter
-- — adding trailing params to create_group is exactly what caused the
-- function-overload bug fixed in 20260806211500. Called right after
-- group creation from the client instead.
create function public.set_safety_fund_type(p_group_id uuid, p_safety_fund_type public.safety_fund_type)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups
  set safety_fund_type = p_safety_fund_type
  where id = p_group_id
    and exists (
      select 1 from public.group_members
      where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
    );

  if not found then
    raise exception 'Only a group admin can set the safety fund type';
  end if;
end;
$$;
