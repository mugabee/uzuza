import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

const nextConfig: NextConfig = {
  // Required for cPanel/Passenger hosting (a self-contained build with
  // its own server.js), but actively breaks Vercel's own build tracing
  // (ENOENT on next-server.js.nft.json) — confirmed by a real failed
  // deploy, not assumed. Only set this when CPANEL_BUILD=1 is passed,
  // i.e. only for the actual cPanel build, never for Vercel.
  ...(process.env.CPANEL_BUILD
    ? {
        output: "standalone" as const,
        // TypeScript's project-wide type-check is the single most
        // memory-hungry phase of a Next.js build, and this host's
        // CloudLinux LVE per-account memory cap (invisible to `ulimit -a`,
        // separate from and much stricter than the physical host's total
        // RAM) OOM-killed the build partway through it - confirmed via
        // the shell's own "Killed" message, not assumed. The code is
        // already fully type-checked on Vercel before it's ever pulled
        // here, so skipping it again on this memory-constrained box
        // trades redundant safety for actually being able to build.
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true },
        // Shared-hosting CPU/memory limits appear to cause the webpack
        // build's worker-thread module resolution to intermittently
        // report a handful of real, existing files as unresolvable
        // (confirmed not a missing-file/syntax/config issue - same
        // files, byte-identical content, reproduced across multiple
        // clean rebuilds). Forcing single-worker compilation removes
        // that parallelism as a variable. Not needed on Vercel, which
        // has no such resource ceiling.
        experimental: { cpus: 1, workerThreads: false },
        // experimental.cpus only limits Next's worker *processes* - the
        // failure pattern (a fixed-size batch of real, valid @/ imports
        // reported unresolvable, which SHIFTS to a different batch once
        // the first one is worked around) points at webpack's own
        // internal module-building concurrency instead. config.parallelism
        // targets that directly.
        webpack: (config: {
          parallelism?: number;
          cache?: boolean | Record<string, unknown>;
          resolve?: { alias?: Record<string, string> };
        }) => {
          config.parallelism = 1;
          config.cache = false;
          // The real bug: every @/-prefixed import (not just @/lib/*, as
          // first suspected — @/components/* fails identically once the
          // @/lib/* imports are converted away) intermittently fails to
          // resolve on this host, with only a small batch surfacing per
          // build before the compiler gives up — immune to every
          // concurrency/cache lever tried. That means Next's automatic
          // tsconfig-paths-to-webpack-alias integration is what's broken
          // here, not any individual file. Registering the alias directly
          // with webpack bypasses that integration entirely.
          config.resolve = config.resolve ?? {};
          config.resolve.alias = {
            ...config.resolve.alias,
            "@": path.resolve(process.cwd()),
          };
          return config;
        },
      }
    : {}),
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
