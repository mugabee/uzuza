-- New wallet_transactions type for a group payout landing in the
-- recipient's personal wallet balance (only for uzuza_held custody
-- groups - group_owned payouts never touch personal custody, since that
-- money moves directly via the group's own MoMo account). Split into its
-- own migration since Postgres won't let a new enum value be used in the
-- same transaction it was added in - same gotcha documented elsewhere in
-- this project (late-payment status additions).
alter type public.wallet_transaction_type add value 'payout_credit';
