-- Practical KYC step that doesn't require the (still-nonexistent) NIDA
-- API partnership: users can upload the front/back of a national ID (or
-- equivalent), an AI vision call extracts the printed name and compares
-- it to what they registered with, and the result is attached to the
-- EXISTING id_verification_requests staff review queue (built in Phase
-- 9, deliberately left empty since there was no submission flow — see
-- that migration's own comment). This extends that table rather than
-- replacing it; list_id_verification_requests/decide_id_verification
-- already existed and are only widened, not redesigned.
--
-- Non-negotiable per the request: the AI result is ADVISORY ONLY. There
-- is no auto-approve path anywhere in this migration — a user is marked
-- identity_verified only inside decide_id_verification, only when a
-- staff member explicitly approves, exactly like every other approval
-- flow in this app (payouts, contributions, group changes).
--
-- This is a genuinely new sensitive-PII surface (government ID images +
-- full names) — confirmed the request table was still empty in
-- production before adding NOT NULL columns to it. Images go in a
-- PRIVATE storage bucket (readable only by the uploading user or staff,
-- never public), mirroring the existing contribution-proofs/
-- payout-proofs bucket pattern exactly.

alter table public.profiles
  add column identity_verified boolean not null default false,
  add column identity_verified_at timestamptz;

create type public.id_verification_match_result as enum ('match', 'mismatch', 'low_confidence', 'unavailable');

alter table public.id_verification_requests
  add column front_image_path text not null,
  add column back_image_path text not null,
  add column submitted_full_name text,
  add column extracted_name text,
  add column match_result public.id_verification_match_result,
  add column match_confidence numeric(4, 3),
  add column ai_notes text,
  add column ai_raw_response jsonb;

create index id_verification_requests_status_idx on public.id_verification_requests (status);

-- Users can see their own request's status/result (e.g. after
-- navigating away and back) in addition to staff seeing everything —
-- RLS SELECT policies are OR'd, so this is purely additive to the
-- existing staff policy from Phase 9.
create policy "select own id verification request" on public.id_verification_requests
  for select using (user_id = auth.uid());

-- Storage: private bucket, same shape as contribution-proofs/
-- payout-proofs. Folder-scoped by user_id so a user can only ever
-- upload into their own folder; readable by that same user or staff.
insert into storage.buckets (id, name, public)
values ('id-verification-photos', 'id-verification-photos', false)
on conflict (id) do nothing;

create policy "upload own id verification photo" on storage.objects
  for insert with check (
    bucket_id = 'id-verification-photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "read own or staff id verification photo" on storage.objects
  for select using (
    bucket_id = 'id-verification-photos' and
    ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- Submission RPC. The AI extraction/comparison itself runs server-side
-- in the Next.js API route (Postgres can't call an external vision
-- API) — this RPC's job is purely to persist the result and the
-- pending-request row atomically, same split as every MoMo integration
-- in this app (the route owns the external call, the RPC owns the
-- write). Idempotent the same way as the wallet top-up/withdrawal
-- fixes — reuses a still-open request instead of creating a second one
-- if the user resubmits before the first is reviewed.
create function public.submit_id_verification(
  p_front_path text,
  p_back_path text,
  p_extracted_name text,
  p_match_result public.id_verification_match_result,
  p_match_confidence numeric,
  p_ai_notes text,
  p_ai_raw_response jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_existing uuid;
  new_id uuid;
begin
  perform public.check_rate_limit('submit_id_verification', 30);

  select id into v_existing
  from public.id_verification_requests
  where user_id = auth.uid() and status = 'pending';

  if v_existing is not null then
    return v_existing;
  end if;

  select full_name into v_full_name from public.profiles where id = auth.uid();

  insert into public.id_verification_requests (
    user_id, status, front_image_path, back_image_path, submitted_full_name,
    extracted_name, match_result, match_confidence, ai_notes, ai_raw_response
  ) values (
    auth.uid(), 'pending', p_front_path, p_back_path, v_full_name,
    p_extracted_name, p_match_result, p_match_confidence, p_ai_notes, p_ai_raw_response
  )
  returning id into new_id;

  perform public.log_audit_event(
    'id_verification_submitted', 'id_verification_request', new_id,
    jsonb_build_object('match_result', p_match_result, 'match_confidence', p_match_confidence)
  );

  return new_id;
end;
$$;

-- Return shape widened (front/back paths, AI fields) so staff can
-- review the actual evidence, not just a name — needs DROP + CREATE
-- per this project's own documented CREATE OR REPLACE gotcha.
drop function public.list_id_verification_requests();

create function public.list_id_verification_requests()
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  status public.id_verification_status,
  requested_at timestamptz,
  front_image_path text,
  back_image_path text,
  submitted_full_name text,
  extracted_name text,
  match_result public.id_verification_match_result,
  match_confidence numeric,
  ai_notes text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  select
    r.id, r.user_id, p.full_name, r.status, r.requested_at,
    r.front_image_path, r.back_image_path, r.submitted_full_name,
    r.extracted_name, r.match_result, r.match_confidence, r.ai_notes
  from public.id_verification_requests r
  left join public.profiles p on p.id = r.user_id
  order by r.requested_at desc
  limit 200;
end;
$$;

-- Only place a user is ever marked identity_verified — exclusively on
-- explicit staff approval, never automatically from the AI result.
create or replace function public.decide_id_verification(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;

  update public.id_verification_requests
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.id_verification_status,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id and status = 'pending'
  returning user_id into v_user_id;

  if not found then
    raise exception 'Request not found or already decided';
  end if;

  if p_approve then
    update public.profiles set identity_verified = true, identity_verified_at = now() where id = v_user_id;
  end if;

  perform public.log_audit_event(
    'id_verification_decided', 'id_verification_request', p_id,
    jsonb_build_object('approved', p_approve, 'user_id', v_user_id)
  );
end;
$$;
