"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "../lib/toast";

export function EmailNotificationsToggle({
  initialEnabled,
  hasEmail,
}: {
  initialEnabled: boolean;
  hasEmail: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const showToast = useToast();

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_email_notifications_enabled", { p_enabled: next });
    setBusy(false);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    setEnabled(next);
    showToast(next ? "Email notifications on" : "Email notifications off");
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">Email notifications</h2>
      <p className="mt-1 text-sm text-foreground/60">
        {hasEmail
          ? "A daily summary of what's new across your groups, sent to your email."
          : "Add an email address to your profile to receive a daily summary of activity across your groups."}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Daily digest</p>
        <Button variant={enabled ? "primary" : "secondary"} disabled={busy || !hasEmail} onClick={toggle}>
          {enabled ? "On" : "Off"}
        </Button>
      </div>
    </Card>
  );
}
