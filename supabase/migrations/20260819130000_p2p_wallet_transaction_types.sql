-- Two new wallet_transaction_type values for the upcoming P2P dual
-- payment methods work (send/request money — Option A: real wallet-to-
-- wallet transfer). Own migration ahead of the one that uses them,
-- same ADD VALUE / same-transaction restriction as every other enum
-- addition in this project.
alter type public.wallet_transaction_type add value 'p2p_sent';
alter type public.wallet_transaction_type add value 'p2p_received';
