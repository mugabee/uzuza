<div align="center">

# Uzuza

**Twuzuzanya. "We complete each other."**

A digital platform for community group finance, built for East Africa. It starts with *ibimina*, the rotating savings groups that market traders, professionals and church groups have run on paper and WhatsApp for generations, and extends that same trust model to event pledge collections, cross-border family contributions, and other shared money arrangements.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Realtime-3ECF8E?logo=supabase)](https://supabase.com/)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-Proprietary-lightgrey)](./LICENSE)

[Live app](https://uzuza-v7cu.vercel.app) · [Report a bug](../../issues/new?template=bug_report.md) · [Request a feature](../../issues/new?template=feature_request.md)

</div>

---

## Why this exists

Millions of people across Rwanda and the wider region already save together in ibimina, and the system works because it's built on trust. The problem is what trust has to run on today: a notebook, a WhatsApp thread, a treasurer everyone hopes is keeping honest records. When money changes hands informally like that, disputes happen, records get lost, and sometimes people just walk away with the pot. None of that is a flaw in the idea of group saving. It's a flaw in the tools people have been given to do it with.

Uzuza replaces the notebook with a shared ledger every member can see for themselves. Every contribution gets a unique payment reference. No payout leaves the group without multiple people signing off on it. And for people who don't already have a group to join, there's a matching system built around real accountability, not strangers meeting on the internet with no way to check each other's history.

This isn't a fintech idea looking for a market. The market has been running this system by hand for decades. Uzuza just gives it the infrastructure it was always missing.

## What it does

**Rotating savings groups (ibimina).** Fixed contribution amounts on a weekly or monthly schedule, a live ledger every member can check without calling the treasurer, a unique payment reference per member per cycle, and admin confirmation that requires both a screenshot and the mobile money transaction ID. A screenshot alone can be edited, so it's never enough on its own.

**Payouts you can actually trust.** Payout requests need approval from one admin, two of three, or every admin, depending on what the group agreed to at creation. No single person can move the group's money on their own, and proof of transfer is required before a payout gets marked complete. Releasing funds also requires a verified second factor from whoever's approving it.

**Event pledges.** One-time collections for weddings, funerals, school fees, or community projects, with a running total against a goal, three levels of pledge visibility, and a shareable link and QR code so people outside the group can contribute too.

**Matching and trust.** Anyone without an existing group can browse open ones, bring in a couple of people they already know, and fill the rest of the spots through matching rather than starting from zero strangers. A refundable reservation deposit is held safely until the group fills, pre-activation chat lets forming members talk before committing further, and every group starts with a full first-cycle safety fund by default, which is the strongest protection available against someone leaving after they've already received their payout. Once a group activates, the chat keeps working for the life of the group, not just while it's forming.

**A personal wallet and peer payments.** Every member also gets a personal Uzuza wallet. Top up or withdraw via MTN MoMo, see a running transaction history with CSV export for your own records, and pay a group contribution straight out of your available balance instead of a fresh MoMo transfer. Sending or requesting money from another Uzuza user works two ways: an instant wallet-to-wallet transfer for when you're both already using Uzuza, or an offline MoMo payment outside the app with the same screenshot-and-transaction-ID proof discipline used everywhere else. Only real Uzuza-held money ever moves the wallet balance; an offline MoMo payment between two people never touches it, on purpose, so the number always means what it says.

**A real profile, not a popup.** Country and phone number use a proper international picker with IP-based suggestion and full validation for any country, not just Rwanda and Uganda, and the same picker drives a Country & Currency setting on a full profile page that keeps the right currency showing everywhere. Signing in and creating an account are two separate, dedicated pages rather than one screen with a mode toggle.

**Passkey app lock.** Members can enroll a device passkey (Face ID, fingerprint, Windows Hello) under Settings, Account security. Once enrolled, the app locks itself after being in the background for a while and asks for that passkey before letting you back in. It's a local re-authentication layer on top of the existing sign-in, not a replacement for it, so it works the same way whether you signed up with a phone number or an email.

**Notifications that actually reach people.** An in-app notification center covers every account and group event in real time. Members with an email on file can also opt into a daily digest of what they missed, sent automatically on a schedule so it works even if nobody opens the app that day.

**Send money from anywhere.** Contributions, pledges, reservation deposits, and late payments can all be paid from outside Rwanda. A family member abroad can send in their own currency (USD, EUR, GBP, KES, UGX and more), see a live exchange rate estimate, and pay via bank transfer, Wise, or an MTN Mobile Money remittance corridor with real transaction status lookups. The group's own bookkeeping stays entirely RWF native no matter how the money came in.

**Built for East Africa, not adapted for it.** Core screens are available in English, Kinyarwanda, and Luganda. Payment status uses the same sent and read tick convention people already know from WhatsApp, and the in-app group chat is styled to match it too, so nothing about the interface has to be learned from scratch.

**Admin tools for when things go wrong.** Missed payments follow a clear escalation path instead of turning into an argument in the group chat, including a pay late with a fine option to stay in good standing. Group settings changes go through the same multi-admin approval as a payout. Members can request a pause or an orderly exit, and every exit produces a plain language agreement both sides can see, so nobody's left guessing what was decided.

**Custody on your own terms.** Groups can keep their money in their own mobile money account, or opt into Uzuza holding funds instead, with plain, explicit consent before that ever happens. Custody is capped platform wide, reconciled per group including which currency and channel each contribution actually came in through, and swept out automatically on a schedule rather than waiting on a staff member to notice and act.

**An operations console.** A separate, staff only tool for watching platform health, reviewing mediation requests, reconciling unmatched payments, tracking custody exposure by currency, controlling what a withdrawal requires (nothing, a verified second factor, full ID verification, or both, platform wide or for one specific member), and keeping an audit trail of every financial and governance action. It's completely unreachable from the consumer app, by design.

**Native apps.** The same app also ships as installable Android and iOS apps through Capacitor, a thin native shell around the same web app rather than a second codebase to maintain. See [Mobile apps](#mobile-apps) below for where that stands.

## Why now

East Africa's mobile money penetration is already high and still growing, but the software layer on top of it hasn't caught up to how people actually save together. Ibimina groups are a proven, decades old behavior with real money moving through them every week. Uzuza isn't asking anyone to change how they save. It's making the existing behavior safer, more transparent, and easier to scale past the size a WhatsApp group and a notebook can reasonably handle.

The build itself reflects that seriousness. Every phase of this project, from the core ledger through matching, custody, cross-border payments, and internal fraud tooling, has been built and verified against a live deployment, not just demoed locally. Custody handling stays on sandbox credentials on purpose, pending the legal review Rwanda's financial regulator requires before real funds move at scale. That's not a gap in the product. It's what taking the regulatory environment seriously actually looks like.

## Built with

- [Next.js](https://nextjs.org/) (App Router) and TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Supabase](https://supabase.com/) for the database, authentication, realtime, and file storage
- [Africa's Talking](https://africastalking.com/) for SMS verification codes
- MTN Mobile Money Collections, Disbursements, and Remittances APIs
- [SimpleWebAuthn](https://simplewebauthn.dev/) for passkey and biometric app lock (WebAuthn)
- [Resend](https://resend.com/) for the daily email notification digest
- [Capacitor](https://capacitorjs.com/) for the Android and iOS app shells
- [Expo](https://expo.dev/) and React Native for the native mobile app in `mobile/` (early stage, see [Mobile apps](#mobile-apps))
- Deployed on [Vercel](https://vercel.com/)

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project
- An Africa's Talking account for SMS delivery
- MTN MoMo developer credentials if you want the mobile money integration working end to end
- A Resend account if you want the email notification digest actually sending (the app runs fine without it)

### Install

```bash
git clone https://github.com/mugabee/uzuza.git
cd uzuza
npm install
```

### Configure environment variables

Copy the example file and fill in your own values.

```bash
cp .env.local.example .env.local
```

Every variable is explained inline in `.env.local.example`. Nothing in that file is a real credential, and `.env.local` itself is never committed.

### Set up the database

Migrations live in `supabase/migrations` and are applied in order with a small runner script that tracks what has already run.

```bash
node scripts/run-migrations.mjs
```

### Run it

```bash
npm run dev
```

The app is available at `http://localhost:3000`.

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the local development server |
| `npm run build` | Produces a production build and type checks the project |
| `npm start` | Runs the production build |
| `npm run lint` | Lints the codebase |
| `node scripts/run-migrations.mjs` | Applies any database migrations that haven't run yet |
| `npm run cap:sync` | Syncs config and assets into the native Android and iOS projects |
| `npm run cap:open:android` | Opens the Android project in Android Studio |
| `npm run cap:open:ios` | Opens the iOS project in Xcode (macOS only) |

The `scripts` folder also has a set of end to end checks that exercise the real backend against a running Supabase project, plus small utilities for verifying the mobile money, SMS, and remittance integrations on their own.

## Project structure

```
app/            Routes, grouped by the App Router's own conventions
components/     Shared UI components
lib/            Supabase clients, validation schemas, and integration code
supabase/       Database migrations
scripts/        Migration runner, integration checks, and deployment utilities
public/         Static assets
android/        Native Android project (Capacitor, wraps the web app)
ios/            Native iOS project (Capacitor, wraps the web app)
mobile/         Separate Expo/React Native app (own package.json, see Mobile apps below)
```

## Deployment

The app deploys to Vercel with zero extra configuration beyond the environment variables above. A scheduled job handles moving funds out of Uzuza's custody once a payout clears approval, so it never depends on a staff member being online to trigger it.

## Mobile apps

Two separate paths exist here, and that's intentional.

**Capacitor (`android/`, `ios/`)** wraps the live web app in a thin native shell. Same codebase, same Supabase backend, no separate UI to maintain. This is the store submission path. Building and signing real binaries needs tooling this repo doesn't assume you already have:

- **Android**: Android Studio (it bundles the JDK, SDK, and Gradle), then `npm run cap:open:android`.
- **iOS**: a Mac with Xcode. There's no way around this from Windows or Linux. Cloud Mac CI (Codemagic, GitHub Actions macOS runners, EAS Build) is the practical substitute if a physical Mac isn't available. Then `npm run cap:open:ios` and open `App.xcworkspace`.

**Expo (`mobile/`)** is a genuinely separate React Native app, built to support the scan a QR code and preview it instantly on a real phone workflow that a Capacitor wrapped website simply can't offer. It reuses the same Supabase backend (schema, RPCs, RLS) but keeps its own `package.json` and isn't a workspace member of the root, since React Native and Next.js dependency trees don't mix well. It's early stage: a scaffold today, not yet at feature parity with the web app.

Neither path has been submitted to a store yet.

## Roadmap

What's tracked openly, rather than left implicit:

- Legal review of Rwanda's BNR licensing threshold before real custody funds move at scale (currently sandbox only)
- A NIDA (Rwanda National ID) partnership for identity verification on matched groups, since no public API exists yet
- A dedicated Uzuza business MoMo account (the custody number is still a placeholder)
- A Resend API key to start actually sending the email notification digest (it safely does nothing until then)
- App Store and Play Store submission for either native app path above
- Feature parity for the Expo/React Native app in `mobile/` (currently scaffold only)

## Status

Rwanda's own regulator has the final say on anything involving real custody of member funds at scale, so that piece stays on sandbox credentials until a proper legal review is complete. Everything else described above is built and verified against a live deployment, not a demo environment.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

All rights reserved. This is a private product under active development. See [LICENSE](./LICENSE), and get in touch before reusing any part of it.
