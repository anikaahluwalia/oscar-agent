"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  ChartColumnIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  HistoryIcon,
  HouseIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { OscarAvatar } from "@/components/oscar-avatar";
import { needsReview } from "@/lib/labels";
import { isOpen, isReadOnly, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; short?: string; icon: typeof HouseIcon };

// From the mock-up: the pages along the side, Settings at the bottom.
const LINKS: NavItem[] = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/review", label: "Review", icon: ClipboardCheckIcon },
  { href: "/activity", label: "Activity", icon: HistoryIcon },
  { href: "/can-do", label: "What Oscar can do", short: "Can do", icon: SlidersHorizontalIcon },
  { href: "/memory", label: "Memory", icon: BookOpenIcon },
  { href: "/safety", label: "Safety", icon: ShieldCheckIcon },
  { href: "/evals", label: "Evals", icon: ChartColumnIcon },
];
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: SettingsIcon };
// On phones: four tabs and More.
const TABS = ["/home", "/review", "/activity", "/evals"];

/** Waiting on you: asks and stops you haven't answered, or while Oscar only reads, calls to check. */
export function useReviewBadge() {
  const { data } = useOscar();
  if (!data) return 0;
  return isReadOnly(data) ? data.items.filter(needsReview).length : data.items.filter(isOpen).length;
}

function NavLink({ href, label, icon: Icon, badge, onClick }: NavItem & { badge?: number; onClick?: () => void }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-[18px]" />
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="min-w-5 rounded-full bg-status-blocked px-1.5 text-center text-xs leading-5 font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/** "Gmail connected · last checked 2 min ago", or the demo inbox. */
function Connection() {
  const { data } = useOscar();
  const gmail = data?.gmail;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const minutes = gmail?.last_sync ? Math.max(0, Math.round((now / 1000 - gmail.last_sync) / 60)) : null;
  return (
    <Link href="/settings" className="flex items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-sm hover:bg-surface-hover">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", gmail?.connected ? "bg-level-silent" : "bg-muted-foreground/50")} aria-hidden />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium">
          {!gmail?.connected ? "Demo inbox" : gmail.acting ? "Gmail connected" : "Gmail connected · read-only"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {!gmail?.connected
            ? "Gmail not connected"
            : minutes === null
              ? "Not checked yet"
              : `Last checked ${minutes < 1 ? "just now" : `${minutes} min ago`}`}
        </span>
      </span>
    </Link>
  );
}

function Logo() {
  return (
    <Link href="/home" className="flex items-center gap-2.5 px-3">
      <OscarAvatar size={34} />
      <span className="text-xl font-extrabold tracking-tight">Oscar</span>
    </Link>
  );
}

function Tab({ href, label, short, icon: Icon, badge }: NavItem & { badge?: number }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground",
        active && "text-primary",
      )}
    >
      <Icon className="size-5" />
      {short ?? label}
      {!!badge && (
        <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-status-blocked px-1 text-center text-[10px] leading-4 text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/** The phone's More menu: every page that isn't a tab. */
function More() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const rest = [...LINKS.filter((l) => !TABS.includes(l.href)), SETTINGS];
  const active = rest.some((l) => l.href === path);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground", active && "text-primary")}
      >
        <EllipsisIcon className="size-5" />
        More
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="More pages" className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/20">
          <button type="button" aria-label="Close" className="flex-1" onClick={() => setOpen(false)} />
          <div className="flex flex-col gap-1 rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="font-semibold">More</span>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-surface-hover">
                <XIcon className="size-5" />
              </button>
            </div>
            {rest.map((l) => (
              <NavLink key={l.href} {...l} onClick={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** The menu: a sidebar on bigger screens; on phones, a slim top bar and tabs along the bottom. */
export function Sidebar() {
  const badge = useReviewBadge();
  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-6 md:flex">
        <Logo />
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {LINKS.map((l) => (
            <NavLink key={l.href} {...l} badge={l.href === "/review" ? badge : undefined} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <NavLink {...SETTINGS} />
          <Connection />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center border-b bg-background/95 px-2 py-3 backdrop-blur md:hidden">
        <Logo />
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {LINKS.filter((l) => TABS.includes(l.href)).map((l) => (
          <Tab key={l.href} {...l} badge={l.href === "/review" ? badge : undefined} />
        ))}
        <More />
      </nav>
    </>
  );
}
