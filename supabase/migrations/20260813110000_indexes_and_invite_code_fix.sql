-- Two more findings from the same audit pass:
--
-- 1. generate_invite_code() was defined without SECURITY DEFINER or a
-- pinned search_path (every other function in this schema has both).
-- Its uniqueness check queries public.profiles, which is RLS-protected
-- (only "select own profile" + "select groupmates' profile") — running
-- as the caller instead of the function owner meant the collision check
-- could only ever see the caller's own row, silently defeating the
-- uniqueness guarantee for anyone who isn't already in a shared group
-- with the colliding code's owner.
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::text, 6, '0');
    select exists (select 1 from public.profiles where invite_code = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

-- 2. Missing indexes on three auth.uid()-filtered columns now queried by
-- get_wallet_summary/get_wallet_transactions on every wallet page load,
-- plus request_exit/proof-submission RPCs — only group_id was indexed on
-- these tables before.
create index if not exists reservations_user_id_idx on public.reservations (user_id);
create index if not exists event_pledges_pledger_id_idx on public.event_pledges (pledger_id);
create index if not exists payout_requests_recipient_user_id_idx on public.payout_requests (recipient_user_id);
