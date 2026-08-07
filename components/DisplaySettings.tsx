"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export function DisplaySettings() {
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    setLargeText(localStorage.getItem("uzuza_text_size") === "large");
    setHighContrast(localStorage.getItem("uzuza_contrast") === "high");
  }, []);

  function toggleLargeText() {
    const next = !largeText;
    setLargeText(next);
    localStorage.setItem("uzuza_text_size", next ? "large" : "default");
    if (next) document.documentElement.setAttribute("data-text-size", "large");
    else document.documentElement.removeAttribute("data-text-size");
  }

  function toggleHighContrast() {
    const next = !highContrast;
    setHighContrast(next);
    localStorage.setItem("uzuza_contrast", next ? "high" : "default");
    if (next) document.documentElement.setAttribute("data-contrast", "high");
    else document.documentElement.removeAttribute("data-contrast");
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">Display</h2>
      <p className="mt-1 text-sm text-foreground/60">
        These apply everywhere in the app, on this device.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Larger text</p>
            <p className="text-xs text-foreground/50">Bigger text throughout the app.</p>
          </div>
          <Button variant={largeText ? "primary" : "secondary"} onClick={toggleLargeText}>
            {largeText ? "On" : "Off"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">High contrast</p>
            <p className="text-xs text-foreground/50">Stronger colors, easier to read in bright light.</p>
          </div>
          <Button variant={highContrast ? "primary" : "secondary"} onClick={toggleHighContrast}>
            {highContrast ? "On" : "Off"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
