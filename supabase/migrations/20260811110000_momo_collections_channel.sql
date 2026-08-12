-- New payment_channel value for pledges paid via a real, API-initiated MTN
-- MoMo Collections Request to Pay, as opposed to the existing channels
-- which are all "pay some other way, then submit proof manually". Added
-- in its own migration since Postgres won't let a new enum value be used
-- in the same transaction it was added in (the same gotcha documented
-- elsewhere in this project's migration history).
alter type public.payment_channel add value 'momo_collections';
