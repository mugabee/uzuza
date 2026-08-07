-- Group settings and profile picture support.
-- Two additions: a group's name becomes an editable field through the same
-- multi admin proposal flow every other setting already uses (never a
-- unilateral edit), and profiles gain an avatar, stored in a public bucket
-- since a profile picture is meant to be seen by anyone the member shares
-- a group with, not gated like the financial proof buckets.

alter table public.profiles add column avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "replace own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "remove own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "anyone can view avatars" on storage.objects
  for select using (bucket_id = 'avatars');

create or replace function public.approve_group_change(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_status public.proposal_status;
  target_payload jsonb;
  target_change_type public.proposal_change_type;
  target_created_at timestamptz;
  is_admin boolean;
  threshold text;
  admin_count int;
  required_approvals int;
  current_approvals int;
  should_apply boolean := false;
begin
  select group_id, status, payload, change_type, created_at
  into target_group_id, target_status, target_payload, target_change_type, target_created_at
  from public.group_change_proposals where id = p_proposal_id;

  if target_group_id is null then
    raise exception 'Proposal not found';
  end if;

  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'admin'
  ) into is_admin;
  if not is_admin then
    raise exception 'Only a group admin can approve a proposal';
  end if;

  if target_status != 'pending' then
    raise exception 'Proposal is not pending';
  end if;

  insert into public.proposal_approvals (proposal_id, approved_by)
  values (p_proposal_id, auth.uid())
  on conflict (proposal_id, approved_by) do nothing;

  select approval_threshold into threshold from public.groups where id = target_group_id;
  select count(*) into admin_count
  from public.group_members where group_id = target_group_id and role = 'admin';
  select count(*) into current_approvals
  from public.proposal_approvals where proposal_id = p_proposal_id;

  required_approvals := case threshold
    when '1' then 1
    when '2-of-3' then least(2, admin_count)
    when 'all' then admin_count
    else 1
  end;

  if current_approvals >= required_approvals then
    should_apply := true;
  elsif now() > target_created_at + interval '5 days'
        and current_approvals * 2 > admin_count then
    should_apply := true;
  end if;

  if not should_apply then
    return;
  end if;

  if target_change_type = 'settings' then
    update public.groups set
      name = coalesce(target_payload->>'name', name),
      contribution_amount = coalesce((target_payload->>'contribution_amount')::numeric, contribution_amount),
      target_size = coalesce((target_payload->>'target_size')::int, target_size),
      approval_threshold = coalesce(target_payload->>'approval_threshold', approval_threshold),
      momo_number = coalesce(target_payload->>'momo_number', momo_number)
    where id = target_group_id;
  elsif target_change_type = 'role_change' then
    update public.group_members
    set role = (target_payload->>'new_role')::public.member_role
    where group_id = target_group_id and user_id = (target_payload->>'target_user_id')::uuid;
  end if;

  update public.group_change_proposals
  set status = 'applied', applied_at = now()
  where id = p_proposal_id;

  perform public.log_audit_event('group_change_applied', 'group_change_proposal', p_proposal_id, jsonb_build_object('change_type', target_change_type, 'payload', target_payload));
end;
$$;
