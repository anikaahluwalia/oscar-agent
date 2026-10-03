"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheckIcon, GaugeIcon, HouseIcon, MailIcon, SettingsIcon, UserIcon } from "lucide-react";
import { OscarAvatar } from "@/components/oscar-avatar";
import { needsReview } from "@/lib/labels";
import { isOpen, isReadOnly, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; short?: string; icon: typeof HouseIcon };

// Four pages and Settings. How Oscar behaves (what he can do, what he's learned, the
// rules he never breaks) lives in Settings, since you only change it now and then.
const LINKS: NavItem[] = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/review", label: "Review", icon: ClipboardCheckIcon },
  { href: "/email", label: "All email", short: "Email", icon: MailIcon },
  { href: "/results", label: "How he's doing", short: "Results", icon: GaugeIcon },
];
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: SettingsIcon };

/** Waiting on you: asks and stops you haven't answered, or on the real inbox, calls to check. */
export function useReviewBadge() {
  const { data } = useOscar();
  if (!data) return 0;
  return isReadOnly(data) ? data.items.filter(needsReview).length : data.items.filter(isOpen).length;
}

function NavLink({ href, label, icon: Icon, badge }: NavItem & { badge?: number }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-[18px]" />
      <span className="flex-1">{label}</span>
      {!!badge && <span className="rounded-full bg-status-needs/15 px-2 text-xs font-semibold text-status-needs">{badge}</span>}
    </Link>
  );
}

function Account() {
  const { data } = useOscar();
  // Until Gmail is connected there's no real account, so say so instead of inventing one.
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserIcon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium">{data?.gmail.connected ? data.gmail.address : "Demo inbox"}</span>
        <span className="text-xs text-muted-foreground">{!data?.gmail.connected ? "Gmail not connected" : data.gmail.acting ? "Gmail · Oscar can act" : "Gmail · read-only"}</span>
      </span>
    </div>
  );
}

function Logo() {
  return (
    <Link href="/home" className="flex items-center gap-2.5 px-3">
      <OscarAvatar size={32} />
      <span className="text-xl font-extrabold tracking-tight">Oscar</span>
    </Link>
  );
}

/** A tab in the phone's bottom bar. */
function Tab({ href, label, short, icon: Icon, badge }: NavItem & { badge?: number }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground",
        active && "text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-5" />
      {short ?? label}
      {!!badge && (
        <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-status-needs px-1 text-center text-[10px] leading-4 text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/** The menu: a sidebar on bigger screens; on phones, a slim top bar and tabs along the bottom. */
export function Sidebar() {
  const badge = useReviewBadge();
  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-6 md:flex">
        <Logo />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {LINKS.map((l) => (
            <NavLink key={l.href} {...l} badge={l.href === "/review" ? badge : undefined} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <NavLink {...SETTINGS} />
          <Account />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center border-b bg-background/95 px-2 py-3 backdrop-blur md:hidden">
        <Logo />
      </header>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {[...LINKS, SETTINGS].map((l) => (
          <Tab key={l.href} {...l} badge={l.href === "/review" ? badge : undefined} />
        ))}
      </nav>
    </>
  );
}
