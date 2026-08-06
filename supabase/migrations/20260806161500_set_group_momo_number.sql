-- Admin-only way to set the group's receiving MoMo number, needed before
-- a cycle can meaningfully start (members need somewhere to pay).
create function public.set_group_momo_number(p_group_id uuid, p_momo_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups
  set momo_number = p_momo_number
  where id = p_group_id
    and exists (
      select 1 from public.group_members
      where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
    );

  if not found then
    raise exception 'Only a group admin can set the MoMo number';
  end if;
end;
$$;
