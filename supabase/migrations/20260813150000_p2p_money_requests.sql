-- Peer-to-peer "send or request money" between two Uzuza users, found by
-- exact phone number or email. Same custody line as everywhere else in
-- this app: Uzuza never holds or moves the money itself (that would be a
-- new regulated personal-wallet product, not a UI addition — the same
-- reasoning that kept the Wallet page read-only, see its own migration's
-- header note). This formalizes the "just send me your MoMo number"
-- exchange that already happens outside the app into a real in-app
-- directory + reference + two-sided confirmation trail — the same
-- proof-based pattern contributions and pledges already use, generalized
-- from group-scoped to person-to-person.

create type public.p2p_status as enum ('pending', 'paid', 'confirmed', 'declined', 'cancelled');

create table public.p2p_requests (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid references auth.users (id) on delete set null,
  payer_id uuid references auth.users (id) on delete set null,
  payee_id uuid references auth.users (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  status public.p2p_status not null default 'pending',
  reference text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  confirmed_at timestamptz
);

create index p2p_requests_payer_id_idx on public.p2p_requests (payer_id);
create index p2p_requests_payee_id_idx on public.p2p_requests (payee_id);

alter table public.p2p_requests enable row level security;
create policy "select own p2p requests" on public.p2p_requests
  for select using (auth.uid() = payer_id or auth.uid() = payee_id);
-- No insert/update policy for clients — every write goes through the
-- SECURITY DEFINER functions below, same pattern as every other
-- financial table in this app.

-- Exact-match only (no partial/fuzzy search) — this is a lookup, not a
-- directory browse, the same distinction WhatsApp's contact-matching
-- draws. Rate-limited so it can't be used to mass-probe phone numbers.
create function public.find_user_by_contact(p_contact text)
returns table (id uuid, full_name text, phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('find_user_by_contact', 3);

  return query
  select p.id, p.full_name, p.phone
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id <> auth.uid()
    and (p.phone = p_contact or lower(u.email) = lower(p_contact))
  limit 1;
end;
$$;

create function public.create_p2p_request(p_contact text, p_direction text, p_amount numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  counterparty_id uuid;
  counterparty_name text;
  my_name text;
  new_id uuid;
  ref text;
  v_payer uuid;
  v_payee uuid;
begin
  perform public.check_rate_limit('create_p2p_request', 5);

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_direction not in ('request', 'send') then
    raise exception 'Invalid direction';
  end if;

  select p.id, p.full_name into counterparty_id, counterparty_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id <> auth.uid()
    and (p.phone = p_contact or lower(u.email) = lower(p_contact))
  limit 1;

  if counterparty_id is null then
    raise exception 'No Uzuza account found for that phone number or email';
  end if;

  if p_direction = 'request' then
    v_payee := auth.uid();
    v_payer := counterparty_id;
  else
    v_payer := auth.uid();
    v_payee := counterparty_id;
  end if;

  ref := 'UZP2P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.p2p_requests (initiator_id, payer_id, payee_id, amount, note, reference)
  values (auth.uid(), v_payer, v_payee, p_amount, p_note, ref)
  returning id into new_id;

  select full_name into my_name from public.profiles where id = auth.uid();

  perform public.create_notification(
    counterparty_id,
    case when p_direction = 'request' then 'Money requested' else 'Money coming your way' end,
    case when p_direction = 'request'
      then coalesce(my_name, 'A member') || ' requested ' || p_amount::text || ' RWF from you.'
      else coalesce(my_name, 'A member') || ' wants to send you ' || p_amount::text || ' RWF.'
    end,
    '/pay'
  );

  return new_id;
end;
$$;

create function public.mark_p2p_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payee uuid;
  v_amount numeric;
begin
  select payee_id, amount into v_payee, v_amount
  from public.p2p_requests where id = p_id and payer_id = auth.uid() and status = 'pending';

  if v_payee is null then
    raise exception 'Request not found or not yours to mark paid';
  end if;

  update public.p2p_requests set status = 'paid', paid_at = now() where id = p_id;

  perform public.create_notification(
    v_payee, 'Payment marked as sent',
    'Confirm you received ' || v_amount::text || ' RWF.',
    '/pay'
  );
end;
$$;

create function public.confirm_p2p_received(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer uuid;
  v_amount numeric;
begin
  select payer_id, amount into v_payer, v_amount
  from public.p2p_requests where id = p_id and payee_id = auth.uid() and status = 'paid';

  if v_payer is null then
    raise exception 'Request not found or not yours to confirm';
  end if;

  update public.p2p_requests set status = 'confirmed', confirmed_at = now() where id = p_id;

  perform public.create_notification(
    v_payer, 'Payment confirmed',
    'Your ' || v_amount::text || ' RWF payment was confirmed received.',
    '/pay'
  );
end;
$$;

create function public.decline_p2p_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  update public.p2p_requests
  set status = 'declined'
  where id = p_id and status = 'pending' and (payer_id = auth.uid() or payee_id = auth.uid())
  returning (case when payer_id = auth.uid() then payee_id else payer_id end) into v_other;

  if v_other is null then
    raise exception 'Request not found or already resolved';
  end if;

  perform public.create_notification(v_other, 'Request declined', 'A pending money request was declined.', '/pay');
end;
$$;

create function public.cancel_p2p_request(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.p2p_requests
  set status = 'cancelled'
  where id = p_id and status = 'pending' and initiator_id = auth.uid();
$$;

-- The list view resolves "the other party" relative to the caller so the
-- client never needs a second round-trip (or broader profile access) just
-- to show who a request is with — profiles RLS only allows seeing
-- groupmates otherwise, and the two sides of a P2P request often aren't
-- in any group together at all.
create function public.list_my_p2p_requests()
returns table (
  id uuid,
  amount numeric,
  note text,
  status public.p2p_status,
  reference text,
  created_at timestamptz,
  paid_at timestamptz,
  confirmed_at timestamptz,
  am_payer boolean,
  am_initiator boolean,
  counterparty_name text,
  counterparty_phone text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id, r.amount, r.note, r.status, r.reference, r.created_at, r.paid_at, r.confirmed_at,
    (r.payer_id = auth.uid()),
    (r.initiator_id = auth.uid()),
    coalesce(cp.full_name, 'Member'),
    cp.phone
  from public.p2p_requests r
  join public.profiles cp on cp.id = (case when r.payer_id = auth.uid() then r.payee_id else r.payer_id end)
  where r.payer_id = auth.uid() or r.payee_id = auth.uid()
  order by r.created_at desc;
$$;
