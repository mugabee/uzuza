-- Backs "Contribute from available balance" (additional requirement
-- alongside the feature list — moving personal wallet money directly
-- into a group contribution). Two new enum values; Postgres won't let a
-- newly added value be used in the same transaction it's added in, so
-- this is its own migration ahead of the one that actually uses them.
alter type public.wallet_transaction_type add value 'contribution_payment';
alter type public.payment_channel add value 'wallet_balance';
