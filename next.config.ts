import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

const nextConfig: NextConfig = {
  // Required for cPanel/Passenger hosting, which needs a self-contained
  // build with its own server.js — Vercel ignores/adapts this fine, so
  // it's safe to leave on even while still deployed there.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `connect-src 'self' ${supabaseOrigin} https://api.qrserver.com`,
              // blob: is required for ScreenshotPreview's local file-picker
              // preview (URL.createObjectURL) - without it, the CSP silently
              // blocked the preview image with no visible error anywhere in
              // the app, only in the browser console.
              "img-src 'self' data: blob: https://api.qrserver.com",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// withSentryConfig only uploads source maps / sets up the build-time
// plugin when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are all
// set — safe no-op locally and on any deploy before those exist.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
});
