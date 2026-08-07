"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useLanguage } from "@/lib/i18n";

export function DisplaySettings() {
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const { language, setLanguage } = useLanguage();

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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Language</p>
            <p className="text-xs text-foreground/50">
              Kinyarwanda covers the contribute, approve, and ledger screens so far.
            </p>
          </div>
          <div className="flex gap-1 rounded-full bg-black/5 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded-full px-3 py-1.5 ${language === "en" ? "bg-white text-primary shadow-sm" : "text-foreground/60"}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage("rw")}
              className={`rounded-full px-3 py-1.5 ${language === "rw" ? "bg-white text-primary shadow-sm" : "text-foreground/60"}`}
            >
              Kinyarwanda
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
