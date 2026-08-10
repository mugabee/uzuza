-- Extends in-app chat (Section 3.6) beyond pre-activation. Members asked
-- for a way to keep talking in-app once a group is active, not just during
-- matching formation. The pre-activation behavior (text-only, no
-- links/media, report/flag, rate limiting) is unchanged and now simply
-- continues after activation instead of freezing read-only.
--
-- group_status only ever has two values ('forming', 'active' -
-- 20260806190000_phase5_matching.sql), so "don't gate on status" is the
-- whole change here. What still needs to be gated is membership_status
-- (20260807100000_phase8_admin_tools.sql) - a removed/exited member must
-- not keep posting into (or reading) a group's chat just because their
-- group_members row is kept for history rather than deleted.

create function public.is_active_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
      and membership_status in ('active', 'paused')
  );
$$;

drop policy "select chat in your groups" on public.chat_messages;

create policy "select chat in your groups" on public.chat_messages
  for select using (public.is_active_group_member(group_id));

create or replace function public.send_chat_message(p_group_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_message_id uuid;
begin
  if not public.is_active_group_member(p_group_id) then
    raise exception 'Only current group members can send chat messages';
  end if;

  if length(trim(p_body)) = 0 or length(p_body) > 500 then
    raise exception 'Message must be 1-500 characters';
  end if;

  if p_body ~* '(https?://|www\.)' then
    raise exception 'Links are not allowed in chat';
  end if;

  if exists (
    select 1 from public.chat_messages
    where group_id = p_group_id and sender_id = auth.uid()
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Sending too fast — please wait a moment';
  end if;

  insert into public.chat_messages (group_id, sender_id, body)
  values (p_group_id, auth.uid(), p_body)
  returning id into new_message_id;

  return new_message_id;
end;
$$;

create or replace function public.flag_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
begin
  select group_id into target_group_id from public.chat_messages where id = p_message_id;
  if target_group_id is null then
    raise exception 'Message not found';
  end if;
  if not public.is_active_group_member(target_group_id) then
    raise exception 'Only current group members can flag messages';
  end if;

  update public.chat_messages set flagged = true where id = p_message_id;
end;
$$;
