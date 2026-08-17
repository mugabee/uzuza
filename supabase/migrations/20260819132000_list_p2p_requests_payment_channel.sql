-- list_my_p2p_requests needs to surface the new payment_channel/proof
-- fields so the client can render the right action (pay from wallet vs.
-- submit MoMo proof) and show existing proof. Adding columns changes
-- the return signature, so the old function is dropped first — same
-- overload-debt gotcha documented elsewhere in this project.
drop function if exists public.list_my_p2p_requests();

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
  counterparty_phone text,
  payment_channel public.payment_channel,
  transaction_id text,
  screenshot_path text
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
    cp.phone,
    r.payment_channel,
    r.transaction_id,
    r.screenshot_path
  from public.p2p_requests r
  join public.profiles cp on cp.id = (case when r.payer_id = auth.uid() then r.payee_id else r.payer_id end)
  where r.payer_id = auth.uid() or r.payee_id = auth.uid()
  order by r.created_at desc;
$$;
