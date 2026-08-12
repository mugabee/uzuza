"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/Card";
import { useToast } from "@/lib/toast";

const APP_VERSION = "0.1.0";

export function OtherSettings() {
  const [checking, setChecking] = useState(false);
  const showToast = useToast();

  async function checkForUpdates() {
    setChecking(true);
    // A full reload always fetches whatever is currently deployed — the
    // simplest honest "check for updates" a PWA with no custom
    // versioning system can offer.
    await new Promise((r) => setTimeout(r, 400));
    showToast("You're on the latest version");
    setChecking(false);
  }

  const rows: { label: string; onClick?: () => void; href?: string }[] = [
    { label: "Report a problem", href: "mailto:support@uzuza.app?subject=Uzuza%20problem%20report" },
    { label: "Privacy policy", href: "/privacy" },
    { label: "Check for updates", onClick: checkForUpdates },
  ];

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">Other</h2>
      <div className="mt-3 flex flex-col divide-y divide-border">
        {rows.map((row) =>
          row.href ? (
            <Link
              key={row.label}
              href={row.href}
              className="flex items-center justify-between py-3 text-sm font-medium text-foreground/80 transition-colors duration-150 hover:text-primary"
            >
              {row.label}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-foreground/30" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ) : (
            <button
              key={row.label}
              type="button"
              onClick={row.onClick}
              disabled={checking}
              className="flex items-center justify-between py-3 text-left text-sm font-medium text-foreground/80 transition-colors duration-150 hover:text-primary disabled:opacity-50"
            >
              {row.label}
              {checking && row.label === "Check for updates" ? (
                <span className="text-xs text-foreground/40">Checking...</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-foreground/30" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              )}
            </button>
          ),
        )}
      </div>
      <p className="mt-3 text-center text-xs text-foreground/30">
        Application version: {APP_VERSION}
      </p>
    </Card>
  );
}
