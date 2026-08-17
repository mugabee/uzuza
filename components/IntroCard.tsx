"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Card";

const STORAGE_KEY = "uzuza_seen_intro";

export function IntroCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Card className="border border-primary/15 bg-primary/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-primary">
          How Uzuza works
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-2.5 shrink-0 rounded-full p-2.5 text-foreground/40 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          ✕
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/70">
        <li>
          <span className="font-medium text-foreground">Every payment gets its own reference.</span>{" "}
          Include it when you send money so an admin can match it to you.
        </li>
        <li>
          <span className="font-medium text-foreground">Nothing is confirmed from a screenshot alone.</span>{" "}
          An admin checks the transaction ID too before marking a payment received.
        </li>
        <li>
          <span className="font-medium text-foreground">No single admin can send a payout alone.</span>{" "}
          Every group requires more than one person to approve before money moves.
        </li>
      </ul>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Got it
      </button>
    </Card>
  );
}
