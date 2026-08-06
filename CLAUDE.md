@AGENTS.md

# Uzuza — Complete Project Reference

Consolidated single source of truth for the Uzuza build. This merges the original product charter, every risk identified in design review, the full feature set, and every decision made across review into one file, so no prior session's context is required to pick this up. Where anything here conflicts with `Uzuza_Master_Project_Plan.md` or `docs/Uzuza_Complete_Project_Reference.md` (the archived source this was consolidated from), **this file wins** — it reflects the most current decision set.

---

## 1. Product Overview

**Uzuza** ("Twuzuzanya" — we complete each other) is a digital platform modernizing Rwandan community group-finance practices — starting with ibimina (rotating savings groups) and extending to event pledge collections and other community-finance shapes.

**Core problem solved:** paper-based/notebook tracking of group money leads to disputes, lost records, and trust breakdowns when people exit early or manage funds badly.

**Core solution:** live shared ledger, unique payment references, multi-person approval before any payout, and a matching system to help people form new groups — while keeping the option to never let Uzuza touch real money (group-owned accounts) as well as a fully-consented custody option (Uzuza-held accounts).

**Primary market:** Rwanda, starting in Kigali.

**Brand tokens:** Primary color deep green `#1a5f4a`. Gold accent `#c9962c` (used for anything tied to money held/reserved). Warm paper background `#f7f4ee`. Display font Manrope, body font Inter. Calm, clear, respectful, community-oriented tone. Mobile-first, large readable text, high-contrast status indicators.

*(Not yet verified against the original prototypes — `uzuza_prototype.html`, `uzuza_full_prototype.html`, `uzuza_internal_console_prototype.html` are still missing from this repo. Treat as a starting point, not pixel-verified truth, until they're recovered — see Section 12.)*

---

## 2. Personas

- **Jean (34)** — existing group admin/treasurer, market shop owner, tired of notebook disputes, Android + MoMo daily user. Represents the fastest-adoption segment (existing organic groups).
- **Aline (27)** — young professional, no existing group, wants matching, comfortable with apps, expects clean mobile UX.
- **Marie (41)** — trader, long-time member of multiple groups, needs large/clear info, checks status without calling the treasurer.

**Priority segments (order):** 1) existing informal ibimina, 2) young professionals/urban savers, 3) market traders/small business clusters, 4) church/community associations, 5) new formers via matching.

---

## 3. Complete Feature Set

### 3.1 Group Types (four confirmed, sequenced across releases)

| Type | Shape | Release |
|---|---|---|
| Rotating Savings Group (ibimina) | Fixed equal contribution, recurring cycles, payout rotates | v1 |
| Event Contribution | Variable pledge amount, one-time, single payout to organizer(s) | v1 |
| Seasonal Savings Group | Time-boxed version of rotating engine (back-to-school, Christmas, agricultural season), natural end date, one-tap convert-to-permanent | v2 |
| Emergency/Solidarity Fund | Always-open mutual aid pool, no scheduled payout, released for emergencies | v2 |
| School Fees Pooling | Term-based, funds paid toward tuition directly, not rotated to individuals | v2 |
| Group Purchasing | Pooled buying power, splits goods not cash | v2 |

### 3.2 Core Ibimina Flow (v1)

- Phone **or** email login; phone always collected separately since MoMo payment matching is phone-based regardless of login method
- OTP verification (Africa's Talking or similar)
- Group creation: name, contribution amount, frequency, target size, account type, rotation method, approval threshold
- **Contribution schedule:** monthly is the default for matched groups (25K / 50K / 100K / 250K / 500K RWF presets + custom "Other" entry). Weekly stays available specifically for the 25K and 50K tiers (serves traders/cash-frequency users). Higher monthly tiers should pair with smaller group sizes (6-8 members) to keep total cycle length reasonable.
- Unique payment reference generated per member per cycle
- Contribute screen: exact amount, reference, group MoMo number, MTN/Airtel instructions
- Admin confirms payment — **requires screenshot proof AND the MoMo transaction ID/confirmation text**, not screenshot alone (screenshots are editable)
- Live shared ledger — every member sees the same balance and status
- Payout request → multi-admin approval (threshold set at group creation: 1 admin / 2-of-3 / all) → **proof of transfer (screenshot + transaction ID) required before marking Completed**
- Rotation order: random draw recommended as the v1 default mechanism (simplest, fair, no negotiation); bidding-based order is a later enhancement
- Cycle completion → celebration screen (shareable total saved, dispute count) → one-tap "Continue to Cycle 2"

### 3.3 Event Contribution (v1, confirmed)

- Creation: event name, date, purpose/description (optional), organizer(s) who receive funds
- Pledging: reuses the unique-reference payment system; supports **"pledge now, pay later"** with reminders as the date approaches
- Live pledge board: running total vs. goal (if set), functions like a fundraising thermometer
- **Visibility — three tiers**: public (names + amounts visible via link, default), name-only (name shown, amount hidden — reduces social-pressure risk from a leaderboard effect), private (organizer only). Consent screen at creation states the default explicitly.
- Payout: multi-person approval when more than one person manages the collection (e.g., both families for a wedding)
- **Cancellation policy needed**: same logic as reservation-fee self-cancellation — more forgiving than a locked commitment, but not a frictionless full refund (prevents pledge-then-vanish abuse)
- After event: downloadable PDF summary/thank-you record
- **Share & QR**: shareable link + QR code for invites, reused for both event pledges and rotating-group invites

### 3.4 Matching & Trust Layer (v1)

Addresses the core risk of matching strangers with money on the line.

- **Weak-tie invites**: members can bring 1-2 known contacts into a matched group; remaining spots filled via matching — not 100% strangers
- **Reputation badges**: "completed 3 cycles, 0 missed payments," tied to verified identity (not siloed per group) so it's visible platform-wide and can't be gamed by re-registering
- **Tiered contribution limits**: first-time solo joiners start at lower tiers (5K-20K equivalent), unlock higher tiers after completed cycles
- **Anchor-admin requirement**: at least one admin slot filled by someone with completed-cycle history
- **Light ID verification (NIDA)**: required before joining a *paid* matched group (not at signup, to keep browsing frictionless) — longest external lead-time item in the whole project (see Section 8)
- **Video intro step**: required before a matched group activates — raises the bar against fake/bot accounts
- **Location/workplace-based matching filters**: latent accountability among people who might actually cross paths
- **Reservation fee**: 5% of the group's contribution amount, **capped at 50,000 RWF**. Full refund if the group never fills. Self-cancellation by an individual should not be a frictionless full refund (needs explicit rule, mirrors event-pledge cancellation logic).
- **Reservation converts to first contribution** — the person "starts" their commitment from the deposit; remaining balance for that first round still owed.
- **Stalled-group handling**: if a forming group hasn't filled within ~3-4 weeks, auto-notify members and offer a full-refund opt-out rather than leaving it open indefinitely.
- **Personal reserve deposit**: the first contribution, once paid, is held for the entire cycle as the member's own protective deposit — refunded at cycle completion. Each person is backed only by their own deposit, never anyone else's savings. Returns to the group's normal rotation from contribution #2 onward.
- **Early release of reserve deposit**: routes through the Exit with Dignity flow (Section 3.7) — remaining obligation covered from the deposit, excess refunded — rather than being frozen with zero flexibility until cycle completion.

### 3.5 Custody & Accounts

Two structurally different custody situations — do not conflate them:

**A) Reservation deposit during group formation (matched groups):**
- **Automatically Uzuza-held** — structural necessity, since no group account exists until the group activates. Not a choice.
- Consent screen explains this plainly: "there's no group account yet, so your deposit is automatically held in Uzuza's secure account until the group activates."

**B) Ongoing rotation contributions (once a group is active), for ALL groups (organic and matched):**
- **Choice between Group-Owned Account and Uzuza Secure Account**, available to all groups
- **Group-Owned Account**: default recommendation; for matched groups specifically, recommend a **multi-signatory MoMo business account** (2-3 admins must jointly authorize) so no single stranger controls the funds, without Uzuza ever touching the money
- **Uzuza Secure Account**: requires explicit informed consent (plain-language screen, not buried in settings) — user confirms understanding that Uzuza holds funds instead of a group/personal account

**Custody guardrails (non-negotiable, must be built, not just planned):**
- Hard platform-wide cap on total funds Uzuza can hold at any moment
- **Automated sweep-out** — scheduled job moving funds to recipient as soon as approval threshold is met; not dependent on staff being online. Humans handle failures only, not routine triggers.
- Per-group ledger segregation with a reconciliation report the group can view on request
- **Honest risk disclosure**: consent screen states plainly that caps/segregation/licensing reduce custody risk, they do not eliminate it — accurate framing, not reassurance
- Parallel legal/regulatory consultation (BNR licensing threshold) — start early, run alongside development, critical before real funds move at scale
- Document ownership decision for any float/interest earned on pooled balances
- Pilot custody with a small group before wide rollout

### 3.6 In-App Chat (Pre-Activation Only)

Fills the gap where the WhatsApp link only attaches after a group activates, but matched members commit money and want to talk while the group is still forming.

- Text-only thread, from the moment a member reserves a spot until the group activates
- **No links or media** — hard rule, removes scam/phishing vector between strangers
- Report/flag a message, block a user — surfaces into the internal ops mediation queue
- Rate limiting for spam prevention
- Pinned group info card (contribution amount, frequency, spots filled) at the top
- Auto-generated system messages ("X reserved a spot — 8/10 filled")
- Reputation badge shown inline next to each name in chat, not just on profile
- System nudge suggesting an experienced member take the anchor-admin role
- **Freeze, don't delete**, after handoff to WhatsApp — read-only archive, may be relevant evidence for later mediation

Once active, the group hands off entirely to its WhatsApp link for ongoing daily chat — the in-app thread never continues after activation.

### 3.7 Admin Tools & Exit Handling

- **Group-change proposals, not unilateral edits**: an admin proposing a change (e.g., contribution amount) routes through the same multi-approval threshold as payouts. **5-day timeout**, with majority-of-active-admins able to proceed if one admin is unreachable, rather than requiring unanimous response indefinitely.
- **Missed-payment escalation sequence**:
  1. Missed payment → automated reminder
  2. Grace period passes → automatic fine, added to owed balance
  3. If member hasn't received the pot yet → pay + fine to stay, or lighter-rules voluntary exit
  4. If member already received the pot → draw from safety fund if enabled (transparent to group); if not covered or not enabled, trigger an explicit in-app group decision (not left to WhatsApp)
  5. Removal, if it happens, is permanent and visible on the member's platform-wide reputation record
- **Safety fund** (exit-risk protection) — group chooses at creation, optional for all groups:
  - **Rolling buffer**: 5-10% on top of normal contribution each round, payouts start immediately; unused buffer refunded pro-rata at cycle end or kept as an ongoing group solidarity fund by vote
  - **Full first-cycle freeze**: everyone contributes for a full cycle before anyone is paid (higher friction, larger protection)
  - Group chooses either at creation; not mandatory for any group type, but recommend pre-selecting it as the default for matched groups specifically
- **Exit with Dignity**: final step of the exit flow — a clear, shared, non-accusatory "Exit Agreement" summary both parties see, covering fine calculation and any safety-fund draw. Replaces an unstructured, shame-driven confrontation.
- **Pause request**: softer alternative to full exit — a member facing temporary hardship can request to skip one round, subject to admin/group approval.
- **Bulk payment confirmation**: admin UI to confirm multiple matching payments at once, ahead of full automated MoMo statement matching (post-launch item).
- **Admin succession/recovery flow**: remaining admins + majority member vote can reassign an unresponsive or compromised admin's role. Multi-factor protection required on any admin action involving fund release.
- **Request Mediation button**: explicit in-app escalation to Uzuza support, accessible **from the ledger screen itself** (not buried in settings), for unresolved disputes — replaces default fallback to off-platform WhatsApp arguments.
- **Group Constitution / Rules Acknowledgment**: plain-language summary (contribution amount, fine structure, exit rules, safety-fund status) auto-generated at group creation; every member explicitly acknowledges before the group activates.

### 3.8 UX & Retention Features

**Retention:** one-tap cycle renewal (rolls into next cycle, same members/settings); Multi-Group Home dashboard showing next payment due, next payout coming, overall money movement this month, and total weekly/monthly commitment across all groups (also solves cross-group overexposure); turn calendar/countdown.

**Accessibility:** partial Kinyarwanda on core screens (contribute, approve, ledger) pulled forward from post-launch-only; text size/high-contrast toggle; low-data mode (minimal images, cached last-known ledger state).

**Trust & engagement:** streak/consistency badges; cycle-completion celebration screen (shareable to WhatsApp); personal lifetime savings journey view.

**Admin efficiency:** group templates at creation ("Market Group," "Professional Group," "Church Group" with sensible pre-filled defaults — directly resolves group-creation complexity); downloadable PDF cycle summary.

**Group Health Insights**: admin-facing, simple and positive framing (e.g., "healthier than 70% of similar groups"), built on the same contribution-timing signal used for member-facing early-warning nudges — one data pipeline, two presentations. (Early-warning nudges themselves are a v1.2 item, see Section 10.)

### 3.9 Internal Operations Console

A genuinely separate, desktop-oriented, authenticated internal tool — never reachable from consumer app routes. Fills a gap: the original product charter names "support/operations staff" as a user but never designed anything for them.

**Required panels:**
- Platform metrics bar: active groups/members, total held in custody vs. cap, open mediations, pending ID reviews
- **Mediation queue**: escalated disputes from the Request Mediation button; **tiered by stakes** — financial disputes (money already moved) outrank general/informational escalations
- Unmatched payments: reconciliation queue for payments that didn't auto-match a reference
- Custody monitor: live platform-wide holding cap tracking, sweep-out batch timing
- ID verification review: manual review queue for matched-group members pending paid join (interim, until/unless full NIDA API integration exists)

Must be scoped and staffed (even part-time) before custody or matching features go live — both features depend on someone actively watching this console.

### 3.10 Roles & Permissions

| Role | Key Permissions |
|---|---|
| Prospective Member | Browse matching, reserve spots, create groups, join forming groups |
| Member | View ledger, contribute, view personal summary, access chat, request to leave/pause |
| Admin/Treasurer | All Member permissions + confirm payments, create payout requests, approve/reject payouts, propose group changes (subject to multi-approval), manage WhatsApp link |
| **Witness/Observer (formal 4th role)** | **View-only** access to the ledger — explicitly **no approval rights** over payouts or funds. For respected local figures (church leader, family elder, trusted outsider) added to increase trust without giving control. |
| System | Generate references, enforce approval thresholds, send notifications, calculate statuses, maintain audit trail |

A user can hold different roles in different groups (Member in one, Admin in another).

---

## 4. Business Rules (Critical Logic — must never be violated)

- **Payment confirmation**: Admin must explicitly mark a contribution Paid after verifying the MoMo transaction, using unique reference as primary matching key, **plus transaction ID/confirmation text**, not screenshot alone.
- **Multi-approval threshold**: set at group creation (1 admin / 2-of-3 / all); payout cannot be marked Approved until met. No single-admin payout execution.
- **Proof of transfer**: screenshot + transaction ID required before any contribution or payout is marked Completed.
- **Leaving after receiving the pot**: default two-cycle minimum commitment; early exit after receiving requires remaining contributions + group-defined penalty, backed by the safety fund / reserve deposit mechanism (Sections 3.4, 3.7) rather than an unenforceable IOU.
- **Missed payments**: progressive handling per Section 3.7's escalation sequence.
- **Rotation**: random draw is the v1 default mechanism.
- **Reservation fee**: 5% of contribution amount, capped at 50,000 RWF, refundable in full if group fails to form, converts to first contribution if it forms.
- **Custody**: reservation deposits during formation are always Uzuza-held (structural, not a choice); ongoing contributions follow the group's explicit account-type choice. Custody is capped platform-wide, consented to explicitly, and swept out automatically — never a manual/human-triggered release.
- **Group changes**: always a multi-approval proposal, never a unilateral admin edit.

---

## 5. Technical Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Delivery | Progressive Web App (installable, mobile-first) |
| Backend/DB/Auth | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Mobile Money | Unique references + Admin confirmation (MTN MoMo / Airtel Money) |
| Notifications | Supabase + SMS gateway (Africa's Talking); Firebase later if needed |
| Chat | In-app (pre-activation, custom-built, text-only) → WhatsApp Group Link (post-activation, external) |
| Hosting | Vercel (frontend) + Supabase cloud |
| Internal Console | Separate authenticated app/route, not part of consumer PWA |

**Actual scaffolded version:** the repo was bootstrapped with `create-next-app@latest`, which resolved to **Next.js 16**, not the Next 14 originally specified. Treat 16 as the real baseline — it's an App Router release so nothing above changes structurally, but don't assume Next-14-era API docs/patterns apply. React is 19.2.

**Hosting plan:** starting on Vercel for zero-config velocity; the owner has a separate cPanel shared hosting plan (with Node.js App/Passenger support) and intends to migrate there later. To keep that migration cheap when it happens:

- **Avoid Vercel-specific services** for anything stateful or critical — no Vercel KV/Blob/Postgres, no load-bearing use of Vercel Cron (Supabase + a portable cron mechanism is safer for the Phase 7 sweep-out job long-term). Supabase remains the backend regardless of host, so this is mostly already the natural path.
- **Avoid Edge-runtime-only APIs** unless there's a specific reason — Node runtime routes port more predictably to a Passenger-hosted `server.js` later.
- When migration happens: rebuild with `output: "standalone"` in `next.config.ts` (not needed on Vercel, required for Passenger), move env vars into cPanel's Node.js App interface, and swap any Vercel Cron jobs for cPanel Cron Jobs hitting the same API routes.

**Why this stack otherwise:** fast development velocity (especially with AI coding assistants), strong mobile browser experience, Supabase bundles auth/db/realtime with minimal backend code, low initial cost.

**Mobile app strategy:** the owner's actual goal is a **Play Store / App Store listing**, not just an installable PWA. Decision: keep building the Next.js PWA exactly as planned — do not start a separate React Native/Flutter codebase. Later (realistically around Phase 10/11, hardening/soft launch), wrap the same web app with **Capacitor** to produce real `.aab`/`.ipa` store builds. This is a thin native shell around the existing frontend, not a rewrite:

- Backend (Supabase, MoMo integration, business rules) transfers unchanged regardless of what renders the UI.
- Frontend/UI code transfers unchanged — Capacitor points its native shell at the same React/Next.js app (live URL or bundled build).
- Extra work needed only at wrap time: Google Play Developer account ($25 one-time), Apple Developer account ($99/year), store review, icons/splash/permissions config. None of this blocks or changes Phase 0-9 web development.
- If a future feature needs something a webview genuinely can't do (biometric login, deep push customization, background processing), that's a small native plugin added to the Capacitor shell, not a rewrite.

---

## 6. Data Model Notes

Core entities:

- `profiles` (users) — includes optional NIDA verification status/reference, reputation summary
- `groups` — includes `group_type` (rotating / event / seasonal / emergency / school-fees / purchasing), `account_type` (group-owned / uzuza-held), `safety_fund_type` (off / buffer / freeze), `rotation_method` (random / fixed / bidding — v1 ships random + fixed)
- `group_members` (roles: prospective / member / admin / witness)
- `cycles`
- `contributions` (with `unique_reference`, `status`, `transaction_id`, `screenshot_url`)
- `payout_requests`, `payout_approvals` (also `group_change_proposals` using the same approval pattern, with a timeout field)
- `leaving_requests` (also `pause_requests`)
- `reserve_deposits` — tracks each member's own held deposit, separate from rotation contributions
- `reservations` — matching-stage spot reservations, fee amount, refund status
- `event_pledges` — for Event Contribution group type: pledge amount, paid/pending, visibility tier
- `chat_messages` — pre-activation only, flagged/reported status, frozen status post-handoff
- `mediation_cases` — internal ops queue, priority tier, assigned staff
- `unmatched_payments` — internal ops reconciliation queue
- `custody_ledger` — per-group reconciliation records for Uzuza-held funds, sweep-out timestamps

All financial and approval actions are logged for auditability — this applies to every entity above, not just the core ones.

---

## 7. Risk Register & Mitigations (Summary)

| Risk | Mitigation |
|---|---|
| Admin withholds/misdirects funds after approval | Screenshot + transaction ID proof required before marking Completed |
| Uzuza custody = regulatory/financial exposure | Platform-wide cap, automated sweep-out, per-group segregation, honest disclosure, parallel legal consult |
| Matching strangers with no trust basis | Weak-tie invites, reputation, tiered limits, video intro, ID check, pre-activation chat |
| Reservation self-cancellation abuse | Needs explicit non-frictionless refund rule (open item — decide before Phase 5 build) |
| Safety-fund adoption vs. dispute KPI | Pre-select as default for matched groups; track adoption alongside dispute-rate KPI |
| Missed payment post-payout (highest-risk case) | Explicit 5-step escalation tied to safety fund / reserve deposit |
| Admin succession / account takeover | Recovery flow, multi-factor on fund-release actions |
| Mismatched/unmatched payments | Dedicated reconciliation flow + internal ops queue |
| Cross-group overexposure | Personal dashboard showing total committed across all groups |
| Group-creation complexity | Smart defaults by group type, templates |
| Rotation position fairness | Random draw as v1 default |
| Reputation gaming via re-registration | Tied to verified identity (NIDA), platform-wide, not per-group |
| New PII surface (NIDA numbers) | Encryption at rest, strict access control, documented data policy |
| Ledger accuracy under custody | Highest-scrutiny code path — dedicated testing, audit logging, second-engineer review |
| Timeline realism | Original 10-14 week MVP scope has grown substantially; realistic v1 is 18-22 weeks |
| Internal ops gap | Dedicated console built and staffed before custody/matching go live |
| In-app chat as scam vector | No links/media, report/block, rate limiting |
| Event pledge social pressure | Three-tier visibility (public/name-only/private) |

---

## 8. APIs & Developer Tools

| Service | Purpose | Free tier | Approval needed |
|---|---|---|---|
| Supabase | Backend/DB/Auth/Realtime | 500MB DB, 50K MAU, 5GB egress, 2 projects; pauses after 7 days inactivity | No — instant |
| Vercel | Frontend hosting (interim — migration to owner's cPanel plan planned later) | Generous free tier for Next.js at MVP scale | No — instant |
| Africa's Talking | SMS OTP (and later USSD) | Free sandbox, free Sender ID registration, no minimum spend | No for sandbox |
| MTN MoMo Developer Portal | Collections + Disbursements | Free sandbox | No for sandbox; Go-Live needs MTN review |
| Airtel Money API | Alternate mobile money rail | Varies | Yes — separate partnership |
| WhatsApp | Post-activation group chat link | Free (`wa.me` links need no API for v1) | No |
| NIDA (Rwanda National ID) | Light ID verification for matched groups | Unknown — no public self-serve API found | **Yes — formal partnership process, start earliest of all items** |
| Legal/regulatory consult (BNR) | Custody licensing threshold | Varies | N/A — engage a lawyer directly |

**Sequencing:** everything free-and-instant (Supabase, Vercel, Africa's Talking sandbox, MoMo sandbox) can start immediately. NIDA and the legal consult have the longest lead times and should start in Phase 0, running in parallel with all technical work — do not let them become launch blockers discovered late.

Real values for these go in `.env.local` (see `.env.local.example` for the current key list) — never commit real values.

---

## 9. Build Phases

| Phase | Weeks | Focus |
|---|---|---|
| 0 | 1-3 days | Environment setup — repo, Supabase, Vercel, Claude Code, design tokens |
| 1 | 1-3 | Foundation — auth (phone/email), group creation, group-type selection |
| 2 | 3-5 | Contributions & ledger, MoMo Collections sandbox |
| 3 | 5-7 | Payouts & multi-approval, MoMo Disbursements sandbox |
| 4 | 6-8 | Transparency, PDF export, Group Constitution doc, Multi-Group Home, retention features, Health Insights |
| 5 | 8-11 | Matching & trust layer, reservation fee, reserve deposit custody, pre-activation chat — **NIDA partnership should already be underway from Phase 0** |
| 6 | 10-12 | Event Contribution feature |
| 7 | 12-15 | Custody & escrow infrastructure — **legal/regulatory review required before real funds** |
| 8 | 14-16 | Admin tools & exit handling (proposals, succession, Exit with Dignity, mediation) |
| 9 | 15-17 | Internal Operations Console (parallel with Phase 8) |
| 10 | 17-19 | Hardening & security review |
| 11 | 19-22 | Soft launch — 5-15 real groups, close support, iterate |

**Realistic total: 18-22 weeks**, not the original 10-14 week estimate — scope has grown substantially through design review.

**Status:** Phase 0 done — GitHub, Supabase, Vercel, Africa's Talking, and all three MTN MoMo products (Collections, Disbursements, Remittances) are live and credential-verified (see `.env.local.example` for the shape; real values in the gitignored `.env.local`).

Phase 1 (Foundation) is done and fully verified live: phone/email OTP login (`app/(auth)/login/`), profile creation (`app/(onboarding)/profile/`), group creation with type selection (`app/groups/new/`, `app/groups/[id]/`). Both phone (via a Send SMS Hook routing through Africa's Talking, since Supabase doesn't support it as a built-in SMS provider) and email OTP confirmed working end-to-end against the real deployed backend.

Phase 2 (Contributions & Ledger) is also done and verified: `app/groups/[id]/page.tsx` is the real ledger (join-by-link, cycle start with random-draw recipient, per-member unique payment references, proof submission with screenshot + transaction ID, admin confirm/reject, auto-completion when every contribution is confirmed). Schema in `supabase/migrations/20260806160000_phase2_contributions.sql` onward (`cycles`, `contributions`, private `contribution-proofs` Storage bucket). Payment itself stays manual (member pays via their own MoMo app, submits proof) per the architecture table above — the MoMo Collections API is used only for a standalone sandbox verification (`scripts/momo-collections-check.mjs`), not to trigger payments from the UI. Full backend flow (two members, cycle, proof, confirmation, completion) verified via `scripts/e2e-phase2-check.mjs` against the live database.

Phase 3 (Payouts & Multi-Approval) is done and verified: once a cycle is `completed`, an admin requests a payout (`request_payout`), other admins approve (`approve_payout`) until the group's `approval_threshold` (`'1'`/`'2-of-3'`/`'all'`, computed live against current admin count, not a stored snapshot) is met, then an admin records proof of transfer (screenshot + transaction ID) to mark it `completed` (`complete_payout`) — same manual-payment philosophy as Phase 2, no automated disbursement from the UI. Schema in `supabase/migrations/20260806170000_phase3_payouts.sql` (`payout_requests`, `payout_approvals`, private `payout-proofs` bucket). `components/PayoutPanel.tsx` renders it on the group page once a cycle completes. `scripts/e2e-phase3-check.mjs` verified the real threshold-blocking behavior specifically — asserted that `complete_payout` is rejected before enough approvals exist (not just that it eventually succeeds), and that a non-admin member can't call `approve_payout` at all.

Phase 4 (Transparency, Reporting & Retention) is done for its actual done-criterion ("an admin can generate a rules document, and a member can see all their groups in one home view") — the full bullet list in Section 3.8 is broader than that, and streak badges / celebration screens / Group Health Insights / Kinyarwanda are deliberately deferred as not required by it. Built: a dynamically-rendered Group Constitution (`app/groups/[id]/constitution/page.tsx`, generated live from group settings, not stored as static text — and honest that fine/exit/safety-fund policy isn't built yet rather than inventing it) with per-member acknowledgment (`constitution_acknowledgments` table, `acknowledge_constitution` RPC — recorded but not yet gating anything, since real group "activation" is Phase 5's matching flow, not this phase); the Multi-Group Home dashboard (`app/page.tsx`, replacing its old unconditional redirect) showing every group a user's in, their own pending contribution if any, whether they're the current cycle's recipient, and separate weekly/monthly commitment totals (not a blended estimate); a printable cycle summary (`app/groups/[id]/cycles/[cycleId]/summary/page.tsx`, `window.print()` to produce a real PDF via the browser rather than adding a PDF-generation dependency); and "Start Next Cycle" relabeling for one-tap renewal, which needed no new backend since `start_cycle` already worked once the prior cycle completed. Verified via `scripts/e2e-phase4-check.mjs`.

Phase 5 (Matching & Trust Layer) is done for its actual done-criterion ("a stranger can find a group, reserve a spot with automatic custody, chat with other forming members, and the group activates once full") — deliberately excludes NIDA verification (no API exists, needs a real partnership — Section 8), the full custody cap/sweep-out system (Phase 7's job, not this one), reputation/tiered-limits/anchor-admin/video-intro/location-filters/block-a-user (real Section 3.4 features, none required by the done-criterion), and stalled-group auto-refund automation (needs a scheduled job, same category as Phase 7's sweep-out — nothing in the app runs on a schedule yet). Built: `groups.status` (`forming`/`active`, existing Phase 1-4 groups default to `active` via column default, verified not to have regressed) and `is_matching_group`; `find_groups()` for browsing (`app/find/page.tsx`); `reserve_spot`/`submit_reservation_proof`/`confirm_reservation` following the exact same proof-of-transfer shape as contributions, recording Uzuza-held funds in `custody_ledger` and auto-activating the group (promoting every `prospective` member, flipping `status`) once every reservation is confirmed and the group is full; pre-activation `chat_messages` (no links, light rate-limit, closes automatically the moment `status` flips — enforced by the insert policy itself, not a separate archival step) at `app/groups/[id]/chat/`; and `start_cycle` extended so a matching group's first cycle treats an already-confirmed reservation as that member's pre-confirmed first contribution (`contributions.reservation_id` traces it back), exactly matching the "reservation converts to first contribution" rule. The reservation deposit's actual receiving MoMo number (`NEXT_PUBLIC_UZUZA_CUSTODY_MOMO_NUMBER`) is a placeholder — Uzuza doesn't have a dedicated business MoMo account yet, which Section 3.5 already flags as a Phase 7 prerequisite; the reserve page shows an honest "being finalized" message rather than a fake number. `scripts/e2e-phase5-check.mjs` verified the full loop including edge cases: chat blocked immediately post-activation, a link-containing message rejected, a non-admin blocked from confirming a reservation, and the admin's own (reservation-less) contribution correctly still `pending` after activation so the cycle doesn't prematurely auto-complete.

Phase 6 (Event Contribution Feature) is done: `group_type = 'event'` existed since Phase 1 but nothing branched on it until now. New `event_pledges` table (separate from `contributions`, matching Section 6's own data model) — variable pledger-chosen amounts, three-tier visibility (`public`/`name_only`/`private`). Pledging deliberately **doesn't require group membership** (unlike ibimina groups) since an event's whole point is collecting from anyone with the link. Visibility masking happens server-side in a new `get_pledge_board()` SQL function (own pledge and admins always see everything; others get per-row masking) rather than trusting the client to hide data it already received — verified directly by the e2e check from a genuine outsider's perspective, not just asserted. `payout_requests.cycle_id` is now nullable with a new `event_group_id` alternative (exactly one required via a check constraint) — `approve_payout`/`complete_payout` needed **zero changes**, since they only ever looked up `group_id`/`status` from the row itself; only a new `request_event_payout` sibling to `request_payout` was needed. `EventPledgeBoard` (`app/groups/[id]/page.tsx` branches on `group_type`) shows the masked board, a real total vs. optional `pledge_goal`, and a QR code via `api.qrserver.com`'s free image endpoint (no new npm dependency) for the Share & QR requirement. Deferred: pledge reminders (needs a scheduler, same gap as Phase 5's stalled-group refund and Phase 7's sweep-out — nothing in the app runs on a schedule yet). `scripts/e2e-phase6-check.mjs` verified all three visibility tiers' masking from an outsider's view, an accurate running total even with masked amounts, pre-payment cancellation, and confirmed that Phase 3's payout approval code works completely unmodified for an event.

**Phase 7 (Custody & Escrow Infrastructure) — technically complete, NOT fully done.** `CLAUDE.md`'s own done-criterion for this phase requires custody to be "fully consented, capped, monitored, and **legally reviewed**" — the legal review (a lawyer familiar with Rwanda's BNR financial regulation) and a real dedicated Uzuza business MoMo account are actions only the project owner can take, and neither exists yet. Do not treat anything below as clearance to move real money — everything stays hardwired to MTN's sandbox, with no production code path anywhere in this phase's code.

What's built: `groups.account_type = 'uzuza_held'` (existed since Phase 1, unused until now) is real — `set_account_type` requires explicit consent to switch to it (recorded in `custody_consents`), `ContributeCard` shows the Uzuza custody number instead of the group's own once a group opts in, and `confirm_contribution` (same signature, extended) now enforces a real platform-wide holding cap (`platform_settings.custody_cap_amount`) before allowing a `uzuza_held` confirmation — verified to actually reject a confirmation that would breach it, not just accept the happy path. `custody_ledger` (from Phase 5) generalized to also track ongoing contributions, not just reservations, with `swept_at`/`swept_reference` for audit trail. `get_custody_reconciliation()` powers a per-group report at `app/groups/[id]/custody/`.

The automated sweep-out (`app/api/cron/sweep-out/route.ts` + `vercel.json`) is the first genuinely scheduled, non-human-triggered process anywhere in the app — real MTN MoMo **Disbursements** API calls (`lib/momo-disbursements.ts`, verified independently via `scripts/momo-disbursements-check.mjs`), not a simulation. Runs daily (`0 3 * * *` — Vercel's Hobby plan caps cron frequency at once/day; discovered when a `*/10 * * * *` schedule got a deployment rejected outright, not a soft warning). `scripts/e2e-phase7-check.mjs` invokes the deployed route directly rather than waiting for the schedule, and confirmed a real sandbox disbursement, correct `payout_requests`/`custody_ledger` state afterward.

Two real bugs found and fixed via this phase's live verification, not just local testing: (1) `create_group` had accumulated three coexisting overloads (8/9/10 params) because `CREATE OR REPLACE FUNCTION` only replaces a function with the *exact same* parameter list — adding trailing params in Phases 5 and 6 silently created new overloads instead of replacing the old ones, leaving PostgREST unable to resolve calls that omitted the newer optional params (fixed by dropping the obsolete two, migration `20260806211500`). (2) The cron route's `payout_requests` → `groups` embed was ambiguous once `event_group_id` (Phase 6) gave that table two foreign keys to `groups` — needed the constraint name spelled out explicitly (`groups!payout_requests_group_id_fkey!inner(...)`), not the generic `groups!inner(...)` shorthand.

Deferred, same reasoning as every other phase: this doesn't retroactively apply sweep-out to Phase 5's reservation-deposit custody, since those deposits resolve via conversion into a first contribution, not a payout.

Phase 8 (Admin Tools & Exit Handling) is done for its actual done-criterion ("every 'what happens when something goes wrong' scenario ... has a working flow, not just a plan"). Built: group-change proposals (`group_change_proposals`/`proposal_approvals`, reusing `approve_payout`'s exact threshold math plus a 5-day/majority fallback) covering both settings changes and admin succession — admin succession is modeled as a `role_change` proposal, not a separate mechanism, since it's structurally identical; bulk payment confirmation (no new RPC — `confirm_contribution` called in a client-side loop); missed-payment reporting (`report_missed_payment`) with real safety-fund draw logic for `buffer`-type groups (a concrete 7.5% surcharge wired into `start_cycle`/`confirm_contribution`, not a configurable range); `freeze`-type needed no new code at all, since "every contribution confirmed before a cycle completes" already is a full first-cycle freeze; pause requests, Exit with Dignity (`request_exit` generates a real Exit Agreement from actual state — has this member ever received this group's payout without a full rotation since), member removal, and mediation case recording (`mediation_cases`, using the exact name reserved in Section 6 — no staff queue UI yet, that's explicitly Phase 9). Deferred, consistent with every other phase's scheduler gap: proactive reminders before a payment is due and auto-triggering a fine on a schedule — both get the admin-triggered equivalent instead. Multi-factor auth on fund-release actions (also mentioned in Section 3.7) fits Phase 10 (Hardening) better than admin tooling.

This phase's live e2e check (`scripts/e2e-phase8-check.mjs`) caught **six real bugs** that only surfaced under genuine end-to-end conditions, not local review — worth naming since it's the strongest evidence yet for why every phase since 7 has verified against the live deployment instead of trusting code in isolation: (1) the original missed-payment "has the recipient been paid" check looked at the wrong cycle and was structurally unreachable (a cycle can't complete, and thus can't have a payout, while one of its own contributions is still unconfirmed) — fixed to check the *member's* payout history across the group instead; (2) a local PL/pgSQL variable named `contribution_amount` in `confirm_contribution` silently collided with the `groups.contribution_amount` column, failing every confirmation with "ambiguous column reference"; (3) `start_cycle` assigned `null` to a `record`-typed variable and then read a field off it — safe for cycle 1 (the field always got a real assignment first) but a hard crash for any later cycle, latent since Phase 5 and only exposed once a test finally started a second cycle; (4) that same loop and the recipient draw never filtered by `membership_status`, so a paused/exited/removed member could still be charged a new contribution or drawn as recipient; (5) `decide_pause`/`decide_exit` assigned a `CASE WHEN ... THEN 'a' ELSE 'b' END` expression straight to an enum column, which Postgres refused to type-infer ("column is of type X but expression is of type text") — needed an explicit cast; (6) the safety-fund draw compared/subtracted the contribution's *full* amount instead of the admin-specified fine amount, so a fund with a smaller balance than a full contribution could never draw even when it could easily cover the actual fine.

Phase 9 (Internal Operations Console) is done for its actual done-criterion — a genuinely separate, staff-authenticated tool, unreachable from any consumer route (checked with `grep -r "/internal" app components` after building, not just assumed: every match lives inside `app/internal/` itself). Access is gated by a new `staff_users` table — a platform-level authorization domain, completely independent of any group's `member_role` — checked via an `is_staff()` `SECURITY DEFINER` helper, with `requireStaff()` (`lib/staff-check.ts`) as the server-side guard on every `/internal/*` page, same shape as every other auth guard in the app. Granting staff access is a direct-database action, same precedent as `platform_settings.custody_cap_amount` since Phase 7 — no self-serve staff signup, deliberately. Built, all five panels from Section 3.9: platform metrics (`get_platform_metrics`), a mediation queue (`list_mediation_cases`/`close_mediation_case`) with automatic stakes tiering added to `request_mediation` — a case is `financial` if its group currently holds `uzuza_held` custody or has a non-completed payout in flight, `general` otherwise, computed from real state at creation time rather than staff-assigned; manual unmatched-payment logging/resolution (`unmatched_payments`, `log_unmatched_payment`/`resolve_unmatched_payment`) since Section 3.7 itself calls automated bank/MoMo statement reconciliation a post-launch item; a cross-group custody monitor (`get_custody_overview`); and an ID-verification review queue (`id_verification_requests`, `list_id_verification_requests`/`decide_id_verification`) that's legitimately empty in production — there's no submission flow anywhere in the app yet to populate it, and building one now would mean collecting and storing sensitive ID data with no real NIDA partnership to receive it (Section 8's blocker still stands). Every internal read goes through a `SECURITY DEFINER` "controlled read function" rather than a direct table read with broad new RLS — the same pattern as `find_groups`/`get_pledge_board` from earlier phases.

One real pre-existing security gap caught and fixed *before* anything shipped, not via a failing e2e check: `platform_settings` (created in Phase 7) never had row-level security enabled at all — readable by any authenticated user, not staff-only. Fixed alongside adding `get_custody_overview()` (migration `20260807121500`) rather than as a separate follow-up. `scripts/e2e-phase9-check.mjs` verified against the live deployment: every internal RPC rejects a non-staff caller both before and after a *different* user is granted access; mediation stakes tiering is correct for both a `uzuza_held` and a `group_owned` group; unmatched-payment log/resolve; and a manually-inserted (via the service-role client, since no real submission flow exists) ID verification request flows correctly through the staff decide-action.

**Dev tooling notes:**
- `scripts/run-migrations.mjs` applies `supabase/migrations/*.sql` via the IPv4 connection pooler (direct `db.<ref>.supabase.co` is IPv6-only and won't resolve in most dev environments), tracked in a `_migrations` table so it's safe to re-run.
- `scripts/e2e-check.mjs` through `scripts/e2e-phase9-check.mjs` are repeatable regression checks against the real deployed backend — they require `sms_test_otp` to be temporarily set in Supabase's auth config (Authentication → Sign In / Providers → Phone → Test Phone Numbers and OTPs; also settable via the Management API — the exact format is a comma-separated `<phone-without-plus>=<code>` list, e.g. `250788000111=123456`), and clean up their own test data on success.
- The GitHub → Vercel auto-deploy webhook has been unreliable in this project (pushes sometimes don't trigger a build) — if a deployment doesn't show up after a push, trigger one explicitly: `POST /v13/deployments` with `gitSource: { type: "github", repoId: 1325117004, ref: "master" }` against the Vercel API, rather than assuming the push failed.
- When adding a new trailing parameter to an existing RPC, `CREATE OR REPLACE FUNCTION` only replaces a function with the *exact same* signature — a changed parameter list silently creates a second overload instead (bit twice: `create_group` in Phase 6, see above). Either keep the signature identical and use a separate small RPC for the new capability (the pattern used for `set_safety_fund_type`), or explicitly `DROP FUNCTION` the old signature in the same migration.
- Vercel/Supabase Management API tokens (account-level, not project secrets) live in the gitignored `.env.tools.local`, separate from the app's own `.env.local` — used for things dashboard-only config can't do via project keys alone (fixing the project's framework preset, syncing env vars, reading/writing auth config).

---

## 10. Post-Launch Roadmap (Confirmed, Not Dropped — Sequenced)

| Release | Contents |
|---|---|
| v1.1 | Savings passport (exportable cycle history for SACCO/lender use), aggregate impact stats, basic USSD balance/confirm menu |
| v1.2 | Compatibility-based matching (ranks by history/punctuality/location), early-warning nudges, voice-note onboarding, formal Witness/Observer role rollout at scale |
| v2 | Emergency/Solidarity Fund groups, School Fees Pooling, Group Purchasing, Seasonal Savings Groups, white-label instances for institutions (churches, employers, SACCOs) |

---

## 11. Open Items Requiring a Decision Before Relevant Phase

- Exact reservation self-cancellation refund policy (needed before Phase 5)
- Exact event-pledge cancellation policy (needed before Phase 6)
- Ownership of any float/interest earned on Uzuza-held custody balances (needed before Phase 7)
- Final legal read on BNR licensing threshold (needed before Phase 7 goes live with real funds)

---

## 12. Reference Prototypes — Still Missing

Three HTML prototypes are referenced throughout this document as the exact visual/component reference (colors, type, spacing, component patterns) but are **not present in this repo**:
- `uzuza_prototype.html` — first 6 core screens
- `uzuza_full_prototype.html` — 19 screens covering onboarding, ibimina flow, matching, event pledges, admin proposals, in-app chat
- `uzuza_internal_console_prototype.html` — internal ops dashboard

Until recovered, any UI work matches brand tokens (Section 1) as a best-effort approximation, not a verified match. See `docs/README.md` for full recovery status.

---

## 13. Working With Claude Code — Practical Guidance

- **One build phase per session where possible** — matches the natural review/testing checkpoints in Section 9, and keeps each session focused rather than sprawling across unrelated systems (e.g., don't mix custody logic and UI polish in the same session).
- **Write tests alongside financial logic** — particularly for Phases 2, 3, and 7 (contributions, payouts, custody), since these are the highest-stakes code paths in the whole app.
- **Use feature branches per phase**, reviewed before merging to main — especially once custody logic exists, since a reconciliation bug has real financial consequences, not just a broken UI.
- **Periodically audit against Section 7's risk register directly** — e.g., "Review the payout approval code against Section 7 — confirm proof-of-transfer is enforced before a payout can be marked Completed."

---

*This file consolidates the original Project Management Document, Risk Analysis & Best Practices, Features & Tooling Reference, Build Guide, and Master Project Plan. The pre-consolidation source (`Uzuza_Complete_Project_Reference.md`) is archived at `docs/Uzuza_Complete_Project_Reference.md`; `Uzuza_Master_Project_Plan.md` at the repo root is the earlier, less complete planning doc this superseded. Where either conflicts with this file, this file wins.*
