-- Second fintech-standards gap-closing pass. Postgres won't allow a new
-- enum value to be used in the same transaction it's added in, so this
-- is its own migration ahead of 20260817101000's actual check function.
alter type public.fraud_flag_type add value 'stale_approved_payout';
alter type public.fraud_flag_type add value 'stalled_forming_group';
