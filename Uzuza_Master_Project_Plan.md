# Uzuza — Master Project Management & Execution Plan
Version 1.0 | Full Build Lifecycle, Consolidated

This is the top-level document. Everything decided across design review is either summarized here or referenced from here. Use this as the entry point when starting work each session — especially when briefing Claude Code.

---

## 0. Document Index — Everything Produced So Far

| Document | Contents | Use it for |
|---|---|---|
| `Uzuza_Project_Manager_Document.pdf` | Original product charter — vision, personas, business rules, original MVP scope | Source of truth for product vision and personas |
| `Uzuza_Risk_Analysis_and_Best_Practices.md` | Every risk identified in early review, with best-practice fixes | Reference before building custody, matching, or payout logic |
| `Uzuza_Features_and_Tooling_Reference.md` | Full expanded feature set (UX, event contributions, matching, chat, internal console, multi-role critique fixes), plus free/low-cost API options | The living spec — most current source of feature decisions |
| `Uzuza_Build_Guide.md` | Original phased build guide with API request steps | Superseded in sequencing by this document, but API request steps still accurate |
| `uzuza_prototype.html` | First 6 core screens | Early visual reference |
| `uzuza_full_prototype.html` | 19 screens — onboarding, ibimina flow, matching, event pledges, admin proposals, chat | Primary visual reference for frontend build |
| `uzuza_internal_console_prototype.html` | Internal ops dashboard — mediation, custody monitor, ID review | Reference for the internal-only build track |

**Recommendation:** before starting the build, download all of these locally into a `/docs` folder in your repository. Claude Code works best when it can read these directly rather than you re-explaining decisions each session.

---

## 1. Project Snapshot

- **Product:** Uzuza — digital platform for Rwandan ibimina (rotating savings), event pledge collection, and related community-finance group types
- **Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres, Auth, Realtime, Storage), Vercel hosting
- **Original scope:** 10-14 week coordination-only MVP
- **Actual current scope:** significantly larger — custody, matching, event pledges, multi-channel trust features, internal ops console, and a defined post-launch roadmap. Realistic v1 timeline is closer to 18-22 weeks with a small team.
- **Team needed:** at minimum a technical founder/developer comfortable with financial logic, ideally supported by Claude Code for implementation velocity; budget part-time support staff before custody/matching go live (someone has to run the internal ops console)

---

## 2. Environment & Tooling Setup (Do This First)

1. Create a private GitHub repository.
2. Create a `/docs` folder in the repo, add all files from the Document Index above.
3. Create a `CLAUDE.md` file at the repo root — this is what Claude Code reads automatically for persistent project context. Include:
   - A short project summary (from Section 1 above)
   - Brand tokens: primary color `#1a5f4a` (deep green), gold accent `#c9962c`, fonts Manrope (display) + Inter (body)
   - A pointer to the `/docs` folder and which document covers what
   - Core business rules that must never be violated (e.g., "reserve deposit is always Uzuza-held for matched groups," "payouts always require multi-approval," "no unilateral admin edits to group settings")
4. Install Claude Code (desktop or terminal), point it at the repository.
5. Create a Supabase project (free tier to start).
6. Create a Vercel project, connect it to the GitHub repo.
7. Set up `.env` files for secrets — never commit these.

---

## 3. Build Phases

Each phase lists what to build, which document to reference, an example prompt for Claude Code, external APIs to request (if any), and what "done" looks like.

### Phase 0 — Design System Foundation (Days 1-3)
**Build:** Tailwind config matching the prototype's design tokens (colors, fonts, spacing); base layout components (phone-frame-free responsive shell, since production is a PWA, not the mockup's phone frames).
**Reference:** `uzuza_full_prototype.html` for exact colors/type/component patterns.
**Example prompt:** *"Set up a Tailwind config matching the color palette and typography in uzuza_full_prototype.html — deep green #1a5f4a primary, gold #c9962c accent, Manrope for headings, Inter for body text. Create base Button, Card, and Pill components matching the visual style shown."*
**Done when:** a component library exists that visually matches the prototype.

### Phase 1 — Foundation (Weeks 1-3)
**Build:** Phone + email login (both supported, phone still required for MoMo matching), OTP verification, profile creation, group creation flow with group-type selection (Rotating Savings vs Event Contribution vs future types), invite by phone/link.
**Reference:** PMD sections 7.1-7.2; Features doc Part 4 login decision.
**API to request now:** Africa's Talking sandbox account (free, instant) for OTP SMS.
**Example prompt:** *"Build the auth flow: phone or email login, OTP verification via Supabase Auth, and a group-type selection screen matching the 'Choose Path' screen in the prototype."*
**Done when:** a user can sign up, verify, and create an empty group of either type.

### Phase 2 — Contributions & Ledger (Weeks 3-5)
**Build:** Unique reference generation, contribute screen, live ledger, admin confirmation with screenshot + transaction ID proof requirement.
**Reference:** PMD section 7.3-7.4; Risk Analysis item 1.1 (payout execution gap — proof requirement applies here too, at confirmation).
**API to request now:** MTN MoMo Developer Portal — sandbox account, subscribe to Collections product.
**Done when:** a full contribution round can be simulated end-to-end against the MoMo sandbox.

### Phase 3 — Payouts & Multi-Approval (Weeks 5-7)
**Build:** Payout request creation, multi-admin approval workflow, threshold logic, proof-of-transfer requirement before marking Completed.
**Reference:** PMD section 7.5; Risk Analysis item 1.1.
**API to request now:** subscribe to MoMo Disbursements product (same portal, same credentials as Phase 2).
**Done when:** a payout can be requested, approved by threshold, and marked complete with proof attached.

### Phase 4 — Transparency, Reporting & Retention (Weeks 6-8)
**Build:** Cycle summaries, PDF export, Group Constitution/Rules Acknowledgment document (auto-generated at creation, member sign-off), Multi-Group Home dashboard (next payment due, next payout coming, monthly movement), one-tap cycle renewal, streak badges, cycle-completion celebration screen, Simple Group Health Insights (admin view).
**Reference:** Features doc Parts 1 and 6.
**Done when:** an admin can generate a rules document, and a member can see all their groups in one home view.

### Phase 5 — Matching & Trust Layer (Weeks 8-11)
**Build:** Matching/Find Group screens, reservation-fee flow (5%, capped 50,000 RWF, converts to first contribution), automatic Uzuza custody for reserve deposits during forming stage, weak-tie invites, reputation badges, tiered contribution limits for new users, anchor-admin requirement, video intro step, pre-activation in-app chat (text-only, no links/media, report/block, rate limiting, pinned info card, system messages, reputation shown inline).
**Reference:** Features doc Parts 2, 8; Risk Analysis item 1.3.
**Start now, finalize by end of phase:** NIDA ID verification partnership conversation (longest lead time in the whole project — start this in Phase 0 if at all possible, not here).
**Done when:** a stranger can find a group, reserve a spot with automatic custody, chat with other forming members, and the group activates once full.

### Phase 6 — Event Contribution Feature (Weeks 10-12)
**Build:** Event creation flow, three-tier pledge visibility (public / name-only / private), "pledge now, pay later" with reminders, live pledge board, Share & QR invite screen, cancellation policy for pledges.
**Reference:** Features doc Part 2; Part 9 (visibility tier and cancellation fixes).
**Reuses:** MoMo integration and reference logic from Phase 2 — no new API needed.
**Done when:** a wedding/event organizer can create a pledge collection and receive funds through the same approval mechanism as ibimina payouts.

### Phase 7 — Custody & Escrow Infrastructure (Weeks 12-15)
**Build:** Uzuza-held account option for ongoing group contributions (not just matched-group reserves), explicit consent screen with honest risk disclosure, platform-wide holding cap, automated sweep-out job (not human-triggered), per-group reconciliation reporting.
**Reference:** Risk Analysis item 1.2; Features doc Part 9 (honest disclosure fix, automated sweep-out fix).
**Critical, non-technical step:** engage a lawyer familiar with Rwanda's BNR financial regulation before this phase touches real funds. Also set up a dedicated business MoMo account for Uzuza's own custody, separate from any group account.
**Done when:** custody is fully consented, capped, monitored, and legally reviewed — not just technically functional.

### Phase 8 — Admin Tools & Exit Handling (Weeks 14-16)
**Build:** Group-change proposal flow with multi-approval and 5-day timeout/majority fallback, bulk payment confirmation, admin succession/recovery flow, missed-payment escalation tied to safety fund, Exit with Dignity flow (including early reserve-deposit release), Pause request (skip one round), Request Mediation button (visible from the ledger screen).
**Reference:** Risk Analysis items 2.2, 2.3; Features doc Parts 6, 9.
**Done when:** every "what happens when something goes wrong" scenario designed in review has a working flow, not just a plan.

### Phase 9 — Internal Operations Console (Weeks 15-17, parallel with Phase 8)
**Build:** Full internal console — platform metrics, mediation queue (tiered by stakes), unmatched-payment reconciliation, custody monitor, ID verification review queue.
**Reference:** `uzuza_internal_console_prototype.html`; Features doc Part 7.
**Access control:** this must be a genuinely separate, authenticated internal tool — never reachable from the consumer app's routes.
**Done when:** a support/ops person (even part-time) can run the platform's day-to-day trust and safety work from this console alone.

### Phase 10 — Hardening & Security Review (Weeks 17-19)
**Build/verify:** security review of authentication and every fund-moving action; multi-signatory group MoMo account setup where selected; real-device testing on common Android phones; load-testing the reconciliation and mediation queues.
**Reference:** Risk Analysis items 4.2, 4.3 (PII handling, ledger accuracy).
**Done when:** a second engineer (or Claude Code, prompted specifically to audit) has reviewed every fund-related code path.

### Phase 11 — Soft Launch (Weeks 19-22)
**Steps:**
1. Recruit 5-15 real groups through personal networks, markets, churches (per PMD section 21 GTM strategy)
2. Run with close support — dedicated internal ops monitoring per Phase 9's console
3. Track: contribution completion rate, dispute rate, mediation volume, custody cap usage
4. Iterate on highest-friction points before wider rollout
5. Only expand to matching/custody-enabled groups once the core rotation flow has proven stable through at least one full cycle with real users

---

## 4. Post-Launch Roadmap (Not Dropped — Just Sequenced)

| Release | Contents |
|---|---|
| v1.1 | Savings passport (exportable cycle history), aggregate impact stats, basic USSD balance/confirm menu |
| v1.2 | Compatibility-based matching, early-warning nudges, voice-note onboarding, community Witness/Observer role (formal 4th role: view-only ledger access) |
| v2 | Emergency/Solidarity Fund groups, School Fees Pooling groups, Group Purchasing groups, Seasonal Savings Groups (with convert-to-permanent option), white-label instances for institutions |

---

## 5. Working With Claude Code — Practical Guidance

- **Start every new session by referencing `CLAUDE.md`** — Claude Code reads it automatically, but confirming it's current keeps decisions from drifting as the project grows.
- **One phase per work session where possible** — matches the natural review/testing checkpoints above, and keeps each Claude Code session focused rather than sprawling across unrelated systems (e.g., don't mix custody logic and UI polish in the same session).
- **Ask Claude Code to write tests alongside financial logic** — particularly for Phases 2, 3, and 7 (contributions, payouts, custody), since these are the highest-stakes code paths in the whole app.
- **Use feature branches per phase**, reviewed before merging to main — especially important once custody logic exists, since a reconciliation bug has real financial consequences, not just a broken UI.
- **Periodically ask Claude Code to audit against the Risk Analysis document directly** — e.g., *"Review the payout approval code against Uzuza_Risk_Analysis_and_Best_Practices.md section 1.1 — confirm proof-of-transfer is enforced before a payout can be marked Completed."*

---

## 6. Quick-Reference: What to Request, and When

| Service | Phase | Cost to start | Approval needed? |
|---|---|---|---|
| Supabase | 0 | Free | No |
| Vercel | 0 | Free | No |
| Africa's Talking (SMS/OTP) | 1 | Free sandbox | No for sandbox; Sender ID free but reviewed |
| MTN MoMo Collections | 2 | Free sandbox | No for sandbox; Go-Live needs MTN review |
| MTN MoMo Disbursements | 3 | Free sandbox | Same portal, separate product |
| Airtel Money API | 2-3 | Varies | Yes — separate partnership |
| WhatsApp | Not needed for v1 | Free (`wa.me` links) | No |
| NIDA ID verification | Start Phase 0, finalize by Phase 5 | Unknown — likely partnership | Yes — start earliest of all items |
| Legal/regulatory consult | Start Phase 0, critical by Phase 7 | Varies | N/A |

---

## 7. Risk Register (Summary — Full Detail in Risk Analysis Doc)

| Category | Status |
|---|---|
| Payout execution gap | Mitigated — proof-of-transfer requirement |
| Custody/regulatory exposure | Mitigated with guardrails — caps, sweep-out, legal review required before Phase 7 goes live with real funds |
| Matching/stranger trust | Mitigated — reputation, tiered limits, ID check, chat, anchor admin |
| Reconciliation accuracy | Mitigated — dedicated unmatched-payment flow, internal ops console |
| Admin single-point-of-failure | Mitigated — multi-approval, succession flow, proposal timeout |
| PII handling (NIDA data) | Requires explicit encryption/access-control implementation in Phase 5 |
| Timeline realism | Flagged — 18-22 weeks realistic vs. original 10-14 week assumption |

---

*This document supersedes the sequencing in `Uzuza_Build_Guide.md`, which remains accurate for API request steps but reflected an earlier, smaller scope. Update this document's phase list as the build progresses — it's meant to be a living project tracker, not a static plan.*
