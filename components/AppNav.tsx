"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/find", label: "Find groups" },
  { href: "/groups/new", label: "New group" },
  { href: "/profile/security", label: "Security" },
];

export function AppNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  // The internal ops console and the pre-auth screens each render their
  // own chrome (or none) — this nav is for the signed-in consumer app only.
  if (
    !signedIn ||
    pathname.startsWith("/internal") ||
    pathname.startsWith("/login")
  ) {
    return null;
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between gap-4 overflow-x-auto border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex items-center gap-5 whitespace-nowrap">
        <Link href="/" className="font-display text-lg font-semibold text-primary">
          Uzuza
        </Link>
        {LINKS.slice(1).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm font-medium transition-colors ${
              pathname === link.href
                ? "text-primary"
                : "text-foreground/60 hover:text-primary"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="whitespace-nowrap text-sm font-medium text-foreground/60 hover:text-primary"
      >
        Sign out
      </button>
    </nav>
  );
}
