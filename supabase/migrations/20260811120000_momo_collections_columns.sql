-- Tracks the MTN MoMo Collections Request to Pay reference for pledges
-- paid through that flow, so status can be polled and matched back to the
-- pledge row. payer_phone records who was actually charged even before
-- any Uzuza account exists for them - the API route that owns this flow
-- runs entirely server-side with the service-role key (not exposed as a
-- public RPC), since it silently creates/reuses an account by phone
-- number without ever showing that person a sign-in screen.
alter table public.event_pledges
  add column collection_reference_id text,
  add column payer_phone text;

create index event_pledges_collection_reference_id_idx
  on public.event_pledges (collection_reference_id)
  where collection_reference_id is not null;
