"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path d="M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20h3.5a1 1 0 0 0 1-1v-9" />
    ),
  },
  {
    href: "/find",
    label: "Find",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m20 20-4.35-4.35" />
      </>
    ),
  },
  {
    href: "/groups/new",
    label: "New",
    icon: <path d="M12 5v14M5 12h14" />,
  },
  {
    href: "/profile/security",
    label: "Security",
    icon: <path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6L12 3Z" />,
  },
];

function SignOutIcon() {
  return (
    <>
      <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  );
}

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
    <>
      {/* Reserves space in normal flow so fixed nav below never covers content. */}
      <div
        aria-hidden
        style={{ height: "calc(56px + env(safe-area-inset-bottom))" }}
      />
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t border-black/10 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              active ? "text-primary" : "text-foreground/50 hover:text-primary"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2.25 : 1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={handleSignOut}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-foreground/50 transition-colors hover:text-primary"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <SignOutIcon />
        </svg>
        Sign out
      </button>
      </nav>
    </>
  );
}
