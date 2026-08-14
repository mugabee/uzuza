"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center font-sans">
        <h1 className="font-display text-xl font-semibold text-primary">Something went wrong</h1>
        <p className="max-w-sm text-sm text-foreground/60">
          Uzuza hit an unexpected error. Nothing was lost — try again, or come back in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
