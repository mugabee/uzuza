"use client";

import { useEffect, useRef } from "react";

// The "setInterval + skip while backgrounded + clean up on unmount" dance
// was independently reimplemented in ChatPanel, GroupLedger, and
// NotificationBell. Consolidated here — every network-refresh poll in the
// app should go through this rather than a bespoke setInterval, so the
// "don't compete for bandwidth while backgrounded" behavior stays uniform
// instead of being something each new poll has to remember to add.
//
// DirectMomoPledgeForm's MoMo-status poll deliberately isn't migrated to
// this — it has its own terminal-state/max-attempts stop condition that
// doesn't fit the "poll forever while mounted" shape this hook covers.
export function usePoll(
  callback: () => void,
  intervalMs: number,
  { skipWhenHidden = true, immediate = false } = {},
) {
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (immediate) savedCallback.current();
    const interval = setInterval(() => {
      if (skipWhenHidden && document.visibilityState !== "visible") return;
      savedCallback.current();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, skipWhenHidden, immediate]);
}
