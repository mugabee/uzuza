import * as Sentry from "@sentry/nextjs";

// No-ops safely without a DSN — mirrors the same "safe until configured"
// pattern as lib/email.ts (Resend). Set NEXT_PUBLIC_SENTRY_DSN once a
// Sentry project exists.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
