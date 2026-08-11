"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

// Only does anything inside the native app (Capacitor.isNativePlatform()
// is false in a normal browser, so this is a no-op there). launchAutoHide
// is off in capacitor.config.ts specifically so the splash stays up until
// this actually runs - i.e. until the live site has rendered - instead of
// hiding on a fixed timer that can race a slow mobile connection and
// briefly show a blank page underneath.
export function SplashScreenHider() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    SplashScreen.hide();
  }, []);

  return null;
}
