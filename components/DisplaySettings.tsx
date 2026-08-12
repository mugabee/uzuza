"use client";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useLanguage } from "@/lib/i18n";
import { useTheme, useLargeText, useHighContrast, useLowDataMode } from "@/lib/prefs";

export function DisplaySettings() {
  const [largeText, toggleLargeText] = useLargeText();
  const [highContrast, toggleHighContrast] = useHighContrast();
  const [lowData, toggleLowData] = useLowDataMode();
  const [theme, applyTheme] = useTheme();
  const { language, setLanguage } = useLanguage();

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
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-xs text-foreground/50">Choose a light or dark look.</p>
          </div>
          <div className="flex gap-1 rounded-full bg-surface-secondary p-1 text-xs font-medium">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => applyTheme(mode)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 capitalize transition-all duration-200 ${
                  theme === mode
                    ? "bg-surface text-primary shadow-[var(--shadow-soft)]"
                    : "text-foreground/60 hover:text-foreground/80"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full border-2 ${
                    theme === mode ? "border-primary bg-primary" : "border-foreground/30"
                  }`}
                />
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Language</p>
            <p className="text-xs text-foreground/50">
              Kinyarwanda and Luganda cover the contribute, approve, and ledger screens so far.
            </p>
          </div>
          <div className="flex gap-1 rounded-full bg-surface-secondary p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded-full px-3 py-1.5 transition-all duration-200 ${language === "en" ? "bg-surface text-primary shadow-[var(--shadow-soft)]" : "text-foreground/60 hover:text-foreground/80"}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage("rw")}
              className={`rounded-full px-3 py-1.5 transition-all duration-200 ${language === "rw" ? "bg-surface text-primary shadow-[var(--shadow-soft)]" : "text-foreground/60 hover:text-foreground/80"}`}
            >
              Kinyarwanda
            </button>
            <button
              type="button"
              onClick={() => setLanguage("lg")}
              className={`rounded-full px-3 py-1.5 transition-all duration-200 ${language === "lg" ? "bg-surface text-primary shadow-[var(--shadow-soft)]" : "text-foreground/60 hover:text-foreground/80"}`}
            >
              Luganda
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Low data mode</p>
            <p className="text-xs text-foreground/50">
              Skips profile photos and QR codes to save data.
            </p>
          </div>
          <Button variant={lowData ? "primary" : "secondary"} onClick={toggleLowData}>
            {lowData ? "On" : "Off"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
