"use client";

import { useEffect, useState } from "react";

// Every display preference here follows the same shape: read the
// persisted value once on mount, expose a setter/toggle that writes to
// localStorage and — where relevant — syncs the matching data-* attribute
// on <html> that app/layout.tsx's blocking inline script also reads
// before first paint. Consolidated after the same read/write/DOM-sync
// logic was independently copy-pasted into DisplaySettings,
// SavingsJourneyCard, WalletView, MemberManagement, and InviteCard.

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(localStorage.getItem("uzuza_theme") === "dark" ? "dark" : "light");
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    localStorage.setItem("uzuza_theme", next);
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  return [theme, setTheme] as const;
}

export function useLargeText() {
  const [large, setLarge] = useState(false);

  useEffect(() => {
    setLarge(localStorage.getItem("uzuza_text_size") === "large");
  }, []);

  function toggle() {
    setLarge((prev) => {
      const next = !prev;
      localStorage.setItem("uzuza_text_size", next ? "large" : "default");
      if (next) document.documentElement.setAttribute("data-text-size", "large");
      else document.documentElement.removeAttribute("data-text-size");
      return next;
    });
  }

  return [large, toggle] as const;
}

export function useHighContrast() {
  const [high, setHigh] = useState(false);

  useEffect(() => {
    setHigh(localStorage.getItem("uzuza_contrast") === "high");
  }, []);

  function toggle() {
    setHigh((prev) => {
      const next = !prev;
      localStorage.setItem("uzuza_contrast", next ? "high" : "default");
      if (next) document.documentElement.setAttribute("data-contrast", "high");
      else document.documentElement.removeAttribute("data-contrast");
      return next;
    });
  }

  return [high, toggle] as const;
}

// Section 3.8: "low-data mode (minimal images, cached last-known ledger
// state)". This covers the "minimal images" half — the two places the app
// loads a network image at all: profile avatars and invite QR codes.
// Caching the last-known ledger state for offline viewing is a separate,
// larger piece of work (a real service-worker caching strategy) and isn't
// part of this.
export function useLowDataMode() {
  const [lowData, setLowData] = useState(false);

  useEffect(() => {
    setLowData(localStorage.getItem("uzuza_low_data") === "on");
  }, []);

  function toggle() {
    setLowData((prev) => {
      const next = !prev;
      localStorage.setItem("uzuza_low_data", next ? "on" : "off");
      return next;
    });
  }

  return [lowData, toggle] as const;
}

export function useBalanceHidden() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem("uzuza_balance_hidden") === "on");
  }, []);

  function toggle() {
    setHidden((prev) => {
      const next = !prev;
      localStorage.setItem("uzuza_balance_hidden", next ? "on" : "off");
      return next;
    });
  }

  return [hidden, toggle] as const;
}
