@AGENTS.md

# Uzuza

Digital platform for Rwandan ibimina (rotating savings groups), event pledge collection, and related community-finance group types. Coordination-only MVP grew in scope to include custody, matching, event pledges, multi-channel trust features, and an internal ops console — realistic v1 timeline is ~18-22 weeks.

**Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres, Auth, Realtime, Storage), Vercel hosting. Scaffolded with `create-next-app@latest`, which resolved to Next 16 — the master plan named Next 14; treat 16 as the actual baseline going forward.

**Planning docs:** `Uzuza_Master_Project_Plan.md` at the repo root is the entry point — phase-by-phase build sequence, example prompts, API request timing, risk register. Read it before starting work on any phase. `/docs` holds supporting documents referenced by the plan; most are currently missing (see `docs/README.md`) — don't assume decisions from them exist unless the file is actually present.

## Brand tokens

- Primary: deep green `#1a5f4a`
- Accent: gold `#c9962c`
- Display font: Manrope
- Body font: Inter

(Pulled from the master plan, not yet verified against the original prototypes — those files are missing. Treat as a starting point, not pixel-verified truth.)

## Business rules that must never be violated

- Reserve deposits for matched groups are always Uzuza-held in custody, never held by an individual admin.
- Payouts always require multi-admin approval — no single-admin payout execution.
- No unilateral admin edits to group settings — changes go through the proposal/approval flow.
- Proof-of-transfer (screenshot + transaction ID) is required before any contribution or payout is marked Completed.
- Custody is capped platform-wide, consented to explicitly, and swept out automatically — never a manual/human-triggered release.

## Working conventions

- One build phase per session where reasonably possible (see plan Section 3) — avoid mixing e.g. custody logic and UI polish in the same session.
- Financial logic (contributions, payouts, custody — plan Phases 2, 3, 7) needs tests alongside implementation; these are the highest-stakes code paths in the app.
- Use feature branches per phase, reviewed before merging to main, especially once custody logic exists.
- Secrets go in `.env.local` (see `.env.local.example` for required keys) — never commit real values.

