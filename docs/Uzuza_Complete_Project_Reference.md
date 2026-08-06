# Uzuza — Complete Project Reference
Consolidated Single Source of Truth | All Decisions Through Design Review

**How to use this file:** Place this at the root of your repository as `CLAUDE.md` (or reference it from your `CLAUDE.md`). It merges the original product charter, every risk identified, every feature added, and every decision made across design review into one document — so Claude Code (or any developer) has full context without needing to read six separate files.

---

## 1. Product Overview

**Uzuza** ("Twuzuzanya" — we complete each other) is a digital platform modernizing Rwandan community group-finance practices — starting with ibimina (rotating savings groups) and extending to event pledge collections and other community-finance shapes.

**Core problem solved:** paper-based/notebook tracking of group money leads to disputes, lost records, and trust breakdowns when people exit early or manage funds badly.

**Core solution:** live shared ledger, unique payment references, multi-person approval before any payout, and a matching system to help people form new groups — while keeping the option to never let Uzuza touch real money (group-owned accounts) as well as a fully-consented custody option (Uzuza-held accounts).

**Primary market:** Rwanda, starting in Kigali.

**Brand tokens:** Primary color deep green `#1a5f4a`. Gold accent `#c9962c` (used for anything tied to money held/reserved). Warm paper background `#f7f4ee`. Display font Manrope, body font Inter. Calm, clear, respectful, community-oriented tone. Mobile-first, large readable text, high-contrast status indicators.

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

Once active, the group hands off entirely to its WhatsApp link (PMD section 7.7) for ongoing daily chat — the in-app thread never continues after activation.

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

A genuinely separate, desktop-oriented, authenticated internal tool — never reachable from consumer app routes. Fills a gap: PMD section 6.2 names "support/operations staff" as a user but never designed anything for them.

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
| **Witness/Observer (new, formal 4th role)** | **View-only** access to the ledger — explicitly **no approval rights** over payouts or funds. For respected local figures (church leader, family elder, trusted outsider) added to increase trust without giving control. |
| System | Generate references, enforce approval thresholds, send notifications, calculate statuses, maintain audit trail |

A user can hold different roles in different groups (Member in one, Admin in another).

---

## 4. Business Rules (Critical Logic)

- **Payment confirmation**: Admin must explicitly mark a contribution Paid after verifying the MoMo transaction, using unique reference as primary matching key, **plus transaction ID/confirmation text**, not screenshot alone.
- **Multi-approval threshold**: set at group creation (1 admin / 2-of-3 / all); payout cannot be marked Approved until met.
- **Leaving after receiving the pot**: default two-cycle minimum commitment; early exit after receiving requires remaining contributions + group-defined penalty, now backed by the safety fund / reserve deposit mechanism (Sections 3.4, 3.7) rather than an unenforceable IOU.
- **Missed payments**: progressive handling per Section 3.7's escalation sequence.
- **Rotation**: random draw is the v1 default mechanism.
- **Reservation fee**: 5% of contribution amount, capped at 50,000 RWF, refundable in full if group fails to form, converts to first contribution if it forms.
- **Custody**: reservation deposits during formation are always Uzuza-held (structural); ongoing contributions follow the group's explicit account-type choice.
- **Group changes**: always a multi-approval proposal, never a unilateral admin edit.

---

## 5. Technical Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Delivery | Progressive Web App (installable, mobile-first) |
| Backend/DB/Auth | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Mobile Money | Unique references + Admin confirmation (MTN MoMo / Airtel Money) |
| Notifications | Supabase + SMS gateway (Africa's Talking); Firebase later if needed |
| Chat | In-app (pre-activation, custom-built, text-only) → WhatsApp Group Link (post-activation, external) |
| Hosting | Vercel (frontend) + Supabase cloud |
| Internal Console | Separate authenticated app/route, not part of consumer PWA |

**Why this stack:** fast development velocity (especially with AI coding assistants), strong mobile browser experience, Supabase bundles auth/db/realtime with minimal backend code, low initial cost.

---

## 6. Data Model Notes

Core entities from the original PMD, expanded by design review:

- `profiles` (users) — now includes optional NIDA verification status/reference, reputation summary
- `groups` — now includes `group_type` (rotating / event / seasonal / emergency / school-fees / purchasing), `account_type` (group-owned / uzuza-held), `safety_fund_type` (off / buffer / freeze), `rotation_method` (random / fixed / bidding — v1 ships random + fixed)
- `group_members` (with roles — now four: prospective/member/admin/witness)
- `cycles`
- `contributions` (with `unique_reference`, `status`, `transaction_id`, `screenshot_url`)
- `payout_requests`, `payout_approvals` (now also `group_change_proposals` using the same approval pattern, with a timeout field)
- `leaving_requests` (now also `pause_requests`)
- `reserve_deposits` (new — tracks each member's own held deposit, separate from rotation contributions)
- `reservations` (new — matching-stage spot reservations, fee amount, refund status)
- `event_pledges` (new — for Event Contribution group type: pledge amount, paid/pending, visibility tier)
- `chat_messages` (new — pre-activation only, flagged/reported status, frozen status post-handoff)
- `mediation_cases` (new — internal ops queue, priority tier, assigned staff)
- `unmatched_payments` (new — internal ops reconciliation queue)
- `custody_ledger` (new — per-group reconciliation records for Uzuza-held funds, sweep-out timestamps)

All financial and approval actions are logged for auditability — this applies to every new entity above, not just the original ones.

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
| Vercel | Frontend hosting | Generous free tier for Next.js at MVP scale | No — instant |
| Africa's Talking | SMS OTP (and later USSD) | Free sandbox, free Sender ID registration, no minimum spend | No for sandbox |
| MTN MoMo Developer Portal | Collections + Disbursements | Free sandbox | No for sandbox; Go-Live needs MTN review |
| Airtel Money API | Alternate mobile money rail | Varies | Yes — separate partnership |
| WhatsApp | Post-activation group chat link | Free (`wa.me` links need no API for v1) | No |
| NIDA (Rwanda National ID) | Light ID verification for matched groups | Unknown — no public self-serve API found | **Yes — formal partnership process, start earliest of all items** |
| Legal/regulatory consult (BNR) | Custody licensing threshold | Varies | N/A — engage a lawyer directly |

**Sequencing:** everything free-and-instant (Supabase, Vercel, Africa's Talking sandbox, MoMo sandbox) can start immediately. NIDA and the legal consult have the longest lead times and should start in Phase 0, running in parallel with all technical work — do not let them become launch blockers discovered late.

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

## 12. Reference Prototypes

Three HTML prototypes exist showing the full visual design — bring these into the repo alongside this file:
- `uzuza_prototype.html` — first 6 core screens
- `uzuza_full_prototype.html` — 19 screens covering onboarding, ibimina flow, matching, event pledges, admin proposals, in-app chat
- `uzuza_internal_console_prototype.html` — internal ops dashboard

Use these as the exact visual/component reference when building the frontend — colors, type, spacing, and component patterns should match what's shown there.

---

*This file consolidates: the original Project Management Document (v1.1), Risk Analysis & Best Practices (v1.0), Features & Tooling Reference (v1.0), Build Guide, and Master Project Plan. Where any of those documents conflict with this one, this file reflects the most current and complete decision set as of consolidation.*
