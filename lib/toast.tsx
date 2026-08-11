"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, NotificationType } from "@capacitor/haptics";

type Toast = { id: number; message: string; kind: "success" | "error" };

const ToastContext = createContext<{ show: (message: string, kind?: Toast["kind"]) => void } | null>(null);

let nextId = 1;

// Toasts are already the single funnel almost every action in the app uses
// to report success/failure, which makes this the one place to add haptic
// feedback centrally instead of scattering Haptics calls across ~20
// components. No-op in a normal browser (Capacitor.isNativePlatform()).
function triggerHaptic(kind: Toast["kind"]) {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.notification({
    type: kind === "success" ? NotificationType.Success : NotificationType.Error,
  }).catch(() => {});
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    triggerHaptic(kind);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-fade-slide-down rounded-full px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-soft-md)] ${
              t.kind === "success" ? "bg-primary" : "bg-red-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.show;
}
