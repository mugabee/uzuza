-- Missed in the Phase 5 migration: create_group needs to accept the
-- matching-group flag. New param appended at the end with a default, so
-- this is a drop-in replacement, not a breaking change for existing calls.
create or replace function public.create_group(
  p_name text,
  p_group_type public.group_type,
  p_contribution_amount numeric,
  p_frequency text,
  p_target_size int,
  p_account_type public.account_type,
  p_rotation_method public.rotation_method,
  p_approval_threshold text,
  p_is_matching_group boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  insert into public.groups (
    name, group_type, contribution_amount, frequency, target_size,
    account_type, rotation_method, approval_threshold, created_by,
    is_matching_group, status
  )
  values (
    p_name, p_group_type, p_contribution_amount, p_frequency, p_target_size,
    p_account_type, p_rotation_method, p_approval_threshold, auth.uid(),
    p_is_matching_group,
    case when p_is_matching_group then 'forming'::public.group_status else 'active'::public.group_status end
  )
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'admin');

  return new_group_id;
end;
$$;
