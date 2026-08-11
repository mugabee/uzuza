"use client";

import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * A native pull-to-refresh gesture, since the app previously only ever
 * refreshed passively via background polling - no way for a user to
 * actively ask for fresh data, which every native app user expects.
 * Only engages when the page is scrolled to the very top, so it never
 * fights with normal scrolling.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  function handleTouchStart(e: TouchEvent) {
    if (refreshing || window.scrollY > 0) {
      active.current = false;
      return;
    }
    startY.current = e.touches[0].clientY;
    active.current = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!active.current || startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    // Resistance: pulling further yields diminishing visual movement.
    setPullDistance(Math.min(delta * 0.5, MAX_PULL));
  }

  async function handleTouchEnd() {
    if (!active.current) return;
    active.current = false;
    startY.current = null;
    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      // router.refresh() doesn't return a promise tied to the fetch
      // actually completing, so without a floor the spinner can flash and
      // vanish instantly rather than reading as a real refresh.
      await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 500))]);
      setRefreshing(false);
    }
    setPullDistance(0);
  }

  const indicatorVisible = pullDistance > 0 || refreshing;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: indicatorVisible ? Math.max(pullDistance, refreshing ? 40 : 0) : 0 }}
      >
        <svg
          className={`h-5 w-5 text-primary/60 ${refreshing ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${Math.min((pullDistance / THRESHOLD) * 180, 180)}deg)` }
          }
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      {children}
    </div>
  );
}
