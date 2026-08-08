"use client";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-[2px]">
      <Card className="max-w-sm shadow-[var(--shadow-soft-lg)] animate-fade-scale-in">
        <h2 className="font-display text-lg font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm text-foreground/70">{description}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
