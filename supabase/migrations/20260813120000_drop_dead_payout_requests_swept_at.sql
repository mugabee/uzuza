-- Audit finding, verified (not assumed): payout_requests.swept_at (added
-- in the Phase 7 custody migration) is never read or written by any RPC,
-- API route, or script anywhere in the codebase — the actual sweep-out
-- cron route (app/api/cron/sweep-out/route.ts) tracks completion via
-- payout_requests.status/completed_at and custody_ledger.swept_at
-- instead. custody_ledger.swept_reference, by contrast, IS written by
-- that same route (the MoMo disbursement reference) even though nothing
-- reads it back yet — that's legitimate forward-looking audit data, not
-- dead, so it's kept.
alter table public.payout_requests drop column swept_at;
