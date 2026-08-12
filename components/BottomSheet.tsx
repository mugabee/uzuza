"use client";

import { useEffect, type ReactNode } from "react";

/**
 * A native-feeling bottom sheet for quick actions (contribute, approve,
 * submit proof) instead of a full page navigation - the common pattern in
 * banking apps for anything that's a short, focused action rather than a
 * whole new screen's worth of content.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div
        className="absolute inset-0 animate-fade-scale-in bg-black/40"
        style={{ animationDuration: "0.2s" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md animate-fade-slide-up rounded-t-3xl bg-surface px-5 pt-3 shadow-[0_-8px_30px_-4px_rgba(28,28,26,0.2)]"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-black/10" />
        <div className="mt-3 flex items-center justify-between">
          {title && (
            <h2 className="font-display text-lg font-semibold text-primary">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-foreground/40 transition-colors duration-150 hover:bg-surface-secondary hover:text-foreground/70"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-3 max-h-[75vh] overflow-y-auto pb-1">{children}</div>
      </div>
    </div>
  );
}
