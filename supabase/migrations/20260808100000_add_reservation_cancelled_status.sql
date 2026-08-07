-- Adding an enum value cannot be used in the same transaction it was added
-- in (a documented Postgres restriction), so this is its own migration,
-- ahead of the function that actually uses 'cancelled' in the next one.
alter type public.reservation_status add value 'cancelled';
