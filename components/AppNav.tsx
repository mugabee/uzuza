"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { useLanguage } from "../lib/i18n";

const TABS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path d="M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20h3.5a1 1 0 0 0 1-1v-9" />
    ),
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: (
      <>
        <rect x="3" y="6.5" width="18" height="13" rx="2.5" />
        <path d="M3 10.5h18" />
        <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
      </>
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
    href: "/profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
      </>
    ),
  },
];

// Only genuinely new destinations belong here — "Find a group" and
// "My groups" used to duplicate the always-visible Find/Home tabs
// directly below this sheet, which meant half of it just repeated the
// tab bar the user could already see and tap.
const STATIC_QUICK_ACTIONS = [
  {
    href: "/groups/new",
    label: "Create a group",
    description: "Start a rotating savings group or an event collection",
    icon: <path d="M12 5v14M5 12h14" />,
  },
  {
    href: "/pay",
    label: "Send or request money",
    description: "Find someone by phone or email, no group needed",
    icon: (
      <>
        <path d="M7 11l3 3 7-7" />
        <path d="M20 12a8 8 0 1 1-3.5-6.6" />
      </>
    ),
  },
];

// type=event routes straight into the existing event-group creation
// flow (CreateGroupFlow.tsx reads this param), skipping the rotating-vs-
// event picker entirely — this path never requires setting up an ibimina
// rotating-savings group.
const PLEDGE_LIST_ACTION = {
  href: "/groups/new?type=event",
  icon: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
};

type Tab = (typeof TABS)[number];

function NavTab({ tab, pathname }: { tab: Tab; pathname: string }) {
  const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
  return (
    <Link
      href={tab.href}
      className="group flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium focus-visible:outline-none"
    >
      <span
        className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-primary/30 ${
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
}

export function AppNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const QUICK_ACTIONS = [
    ...STATIC_QUICK_ACTIONS,
    {
      ...PLEDGE_LIST_ACTION,
      label: t("createPledgeList"),
      description: t("createPledgeListDesc"),
    },
  ];

  // Closes automatically on navigation, so it never lingers open over a
  // new page.
  useEffect(() => {
    setQuickActionsOpen(false);
  }, [pathname]);

  // The internal ops console and the pre-auth screens each render their
  // own chrome (or none) — this nav is for the signed-in consumer app only.
  if (
    !signedIn ||
    pathname.startsWith("/internal") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup")
  ) {
    return null;
  }

  return (
    <>
      {/* Reserves space in normal flow so fixed nav below never covers content. */}
      <div
        aria-hidden
        style={{ height: "calc(56px + env(safe-area-inset-bottom))" }}
      />
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t border-border bg-surface/90 shadow-[0_-4px_20px_-4px_rgba(28,28,26,0.06)] backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.slice(0, 3).map((tab) => (
          <NavTab key={tab.href} tab={tab} pathname={pathname} />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => setQuickActionsOpen(true)}
            aria-label="Quick actions"
            aria-haspopup="dialog"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_12px_-2px_rgba(26,95,74,0.4),0_8px_24px_-4px_rgba(26,95,74,0.3)] ring-4 ring-surface transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-primary/50"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {TABS.slice(3).map((tab) => (
          <NavTab key={tab.href} tab={tab} pathname={pathname} />
        ))}
      </nav>

      <BottomSheet
        open={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        title="Quick actions"
      >
        <div className="flex flex-col gap-1">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              onClick={() => setQuickActionsOpen(false)}
              className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors duration-150 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  {action.icon}
                </svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {action.label}
                </span>
                <span className="block text-xs text-foreground/50">
                  {action.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
