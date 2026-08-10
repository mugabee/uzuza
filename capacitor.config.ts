import type { CapacitorConfig } from "@capacitor/cli";

// Uzuza doesn't have a custom domain yet (still on the Vercel subdomain),
// so this app ID is a placeholder - it MUST be finalized before the first
// real Play Store / App Store submission, since neither store lets you
// change an app's package/bundle ID afterward. Suggested real value once
// a domain exists: the reverse of that domain, e.g. com.uzuza.app if
// uzuza.app is registered.
const config: CapacitorConfig = {
  appId: "com.uzuza.app",
  appName: "Uzuza",
  webDir: "www",
  server: {
    // Points the native shell at the live deployed app rather than a
    // bundled static copy - Uzuza's App Router (server components, API
    // routes, cookie-based auth) can't be statically exported, so this is
    // the correct approach for this app, not a stopgap. `www/index.html`
    // is only a brief local fallback shown before this URL finishes
    // loading, or if there's no network at all.
    url: "https://uzuza-v7cu.vercel.app",
    androidScheme: "https",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
