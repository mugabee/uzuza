-- Real bug caught by the Phase 8 e2e check: "set enum_col = case when x
-- then 'a' else 'b' end" fails with "column is of type X but expression
-- is of type text" — a CASE expression's branches default to text and
-- Postgres doesn't always infer the target enum type from context.
-- decide_pause happened to not get exercised with this exact shape in
-- earlier testing; decide_exit is what surfaced it. Both get explicit
-- casts. Same signatures, safe replacements.

create or replace function public.decide_pause(p_pause_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  is_admin boolean;
begin
  select group_id, user_id into target_group_id, target_user_id
  from public.pause_requests where id = p_pause_request_id;

  if target_group_id is null then
    raise exception 'Pause request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can decide a pause request';
  end if;

  update public.pause_requests
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.pause_status,
      decided_by = auth.uid(), decided_at = now()
  where id = p_pause_request_id and status = 'pending';

  if not found then
    raise exception 'Pause request not found or already decided';
  end if;

  if p_approve then
    update public.group_members
    set membership_status = 'paused'
    where group_id = target_group_id and user_id = target_user_id;
  end if;
end;
$$;

create or replace function public.decide_exit(p_exit_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  is_admin boolean;
begin
  select group_id, user_id into target_group_id, target_user_id
  from public.exit_requests where id = p_exit_request_id;

  if target_group_id is null then
    raise exception 'Exit request not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can decide an exit request';
  end if;

  update public.exit_requests
  set status = (case when p_approve then 'agreed' else 'cancelled' end)::public.exit_status,
      decided_by = auth.uid(), decided_at = now()
  where id = p_exit_request_id and status = 'pending';

  if not found then
    raise exception 'Exit request not found or already decided';
  end if;

  if p_approve then
    update public.group_members
    set membership_status = 'exited'
    where group_id = target_group_id and user_id = target_user_id;
  end if;
end;
$$;
