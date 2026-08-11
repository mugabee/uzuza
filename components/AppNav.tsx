"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
];

const PROFILE_ICON = (
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
  </>
);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const profileActive = pathname.startsWith("/profile");

  // Closes on outside click/tap and on Escape - a menu that only closes by
  // re-tapping its own trigger reads as unresponsive/stuck.
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Closes automatically on navigation, so it never lingers open over a
  // new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
    setMenuOpen(false);
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
        ref={navRef}
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t border-black/[0.06] bg-white/90 shadow-[0_-4px_20px_-4px_rgba(28,28,26,0.06)] backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="group flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
            >
              <span
                className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors duration-200 ${
                  active ? "bg-primary/10" : "group-hover:bg-primary/5"
                }`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.25 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-colors duration-200 ${
                    active ? "text-primary" : "text-foreground/50 group-hover:text-primary"
                  }`}
                >
                  {tab.icon}
                </svg>
              </span>
              <span
                className={`transition-colors duration-200 ${
                  active ? "text-primary" : "text-foreground/50 group-hover:text-primary"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}

        <div className="relative flex flex-1">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="group flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
          >
            <span
              className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors duration-200 ${
                profileActive || menuOpen ? "bg-primary/10" : "group-hover:bg-primary/5"
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={profileActive || menuOpen ? 2.25 : 1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-colors duration-200 ${
                  profileActive || menuOpen ? "text-primary" : "text-foreground/50 group-hover:text-primary"
                }`}
              >
                {PROFILE_ICON}
              </svg>
            </span>
            <span
              className={`transition-colors duration-200 ${
                profileActive || menuOpen ? "text-primary" : "text-foreground/50 group-hover:text-primary"
              }`}
            >
              Profile
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full right-0 mb-2 w-48 origin-bottom-right animate-fade-scale-in rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-[var(--shadow-soft-md)]"
            >
              <Link
                role="menuitem"
                href="/profile"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors duration-150 hover:bg-primary/5 hover:text-primary"
              >
                View profile
              </Link>
              <Link
                role="menuitem"
                href="/profile/security"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors duration-150 hover:bg-primary/5 hover:text-primary"
              >
                Security & display
              </Link>
              <div className="my-1 h-px bg-black/[0.06]" />
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
              >
                <svg
                  width="16"
                  height="16"
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
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
