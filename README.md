# Uzuza

Uzuza (Twuzuzanya, "we complete each other") is a digital platform for community group finance in Rwanda. It starts with ibimina, the rotating savings groups that market traders, professionals and church groups have run on paper and WhatsApp for generations, and extends the same trust model to event pledge collections and other shared money arrangements.

Paper ledgers and screenshots get lost, disputed and forged. Uzuza replaces them with a shared ledger every member can see, unique payment references per contribution, multi person approval before any payout leaves the group, and a matching system that helps new groups form around real accountability instead of strangers on the internet.

## What it does

**Rotating savings groups (ibimina)**
Fixed contribution amounts on a weekly or monthly schedule, a live ledger every member can check without calling the treasurer, unique payment references per member per cycle, and admin confirmation that requires both a screenshot and the mobile money transaction ID, not a screenshot alone.

**Payouts you can trust**
Payout requests need approval from one admin, two of three, or every admin, depending on what the group chose at creation. No single person can move the group's money, and proof of transfer is required before a payout is marked complete.

**Event pledges**
One time collections for weddings, funerals, school fees or community projects, with a running total against a goal, three levels of pledge visibility, and a shareable link and QR code for people outside the group to contribute.

**Matching and trust**
People without an existing group can browse open groups, bring a couple of people they already know, and fill the rest of the spots through matching. A refundable reservation deposit is held safely until the group fills, pre activation chat lets forming members talk before committing further, and every group starts with a full first cycle safety fund by default, the strongest available protection against someone leaving after they have already received their payout.

**Admin tools for when things go wrong**
Missed payments follow a clear escalation path instead of an argument in the group chat. Group settings changes go through the same multi admin approval as a payout. Members can request a pause or an orderly exit, and every exit produces a plain language agreement both sides can see.

**Custody, on your terms**
Groups can keep their money in their own mobile money account, or opt into Uzuza holding funds with explicit, plainly worded consent. Custody is capped platform wide, reconciled per group, and swept out automatically on a schedule rather than waiting on a person to notice.

**Operations console**
A separate, staff only tool for monitoring platform health, reviewing mediation requests, reconciling unmatched payments and keeping an audit trail of every financial and governance action, completely unreachable from the consumer app.

## Built with

- [Next.js](https://nextjs.org/) (App Router) and TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Supabase](https://supabase.com/) for the database, authentication and file storage
- [Africa's Talking](https://africastalking.com/) for SMS verification codes
- MTN Mobile Money Collections and Disbursements APIs
- Deployed on [Vercel](https://vercel.com/)

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project
- An Africa's Talking account for SMS delivery
- MTN MoMo developer credentials if you want the mobile money integration working end to end

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
| `node scripts/run-migrations.mjs` | Applies any database migrations that have not run yet |

The `scripts` folder also has a set of end to end checks that exercise the real backend against a running Supabase project, along with small utilities for verifying the mobile money and SMS integrations independently of the app.

## Project structure

```
app/            Routes, grouped by the App Router's own conventions
components/     Shared UI components
lib/            Supabase clients, validation schemas and integration code
supabase/       Database migrations
scripts/        Migration runner, integration checks and deployment utilities
public/         Static assets
```

## Deployment

The app deploys to Vercel with zero additional configuration beyond the environment variables above. A scheduled job handles moving funds out of Uzuza's custody once a payout clears approval, so it does not depend on anyone being online to trigger it.

## Status

Rwanda's own regulator has the final say on anything involving real custody of member funds at scale, so that piece stays on sandbox credentials until a proper legal review is complete. Everything else described above is built and working against a live deployment.

## License

All rights reserved. This is a private product under active development; get in touch before reusing any part of it.
