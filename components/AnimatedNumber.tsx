"use client";

import { useEffect, useRef, useState } from "react";

// Counts from the previous value up to `value` rather than just appearing -
// a small, recognizable "fintech app" detail (balances/totals almost never
// just snap into place in apps like this). Respects prefers-reduced-motion.
export function AnimatedNumber({
  value,
  duration = 900,
  formatter = (n: number) => Math.round(n).toLocaleString(),
  className,
}: {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    startRef.current = null;

    function step(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    // Safety net: requestAnimationFrame is suspended whenever the page
    // isn't actively compositing (backgrounded tab, some webview
    // contexts) — without this, a money amount could get stuck showing
    // a stale/zero value indefinitely instead of the real one. A plain
    // timer isn't subject to the same throttling, so it guarantees the
    // true value always lands even if the animation itself never ran.
    const fallback = setTimeout(() => {
      setDisplay(value);
      fromRef.current = value;
    }, duration + 150);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{formatter(display)}</span>;
}
