"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumnIcon,
  HistoryIcon,
  HouseIcon,
  InboxIcon,
  LightbulbIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  UserRoundCheckIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OscarAvatar } from "@/components/oscar-avatar";
import { countsOf, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/needs-you", label: "Needs You", icon: UserRoundCheckIcon },
  { href: "/activity", label: "Activity", icon: HistoryIcon },
  { href: "/memory", label: "What Oscar Knows", icon: LightbulbIcon },
  { href: "/evals", label: "Evals", icon: ChartColumnIcon },
];

function NavLink({ href, label, icon: Icon, badge, onClick }: (typeof LINKS)[number] & { badge?: number; onClick?: () => void }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
        active && "bg-sidebar-accent text-foreground",
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {!!badge && <span className="rounded-full bg-status-needs/15 px-1.5 text-xs font-medium text-status-needs">{badge}</span>}
    </Link>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useOscar();
  const counts = data ? countsOf(data.items) : null;
  const waiting = counts ? counts.ASK_FIRST + counts.ESCALATE : 0;
  return (
    <>
      <nav className="flex flex-col gap-0.5">
        {LINKS.map((l) => (
          <NavLink key={l.href} {...l} badge={l.href === "/needs-you" ? waiting : undefined} onClick={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        <NavLink href="/settings" label="Settings" icon={SettingsIcon} onClick={onNavigate} />
        {/* Until Gmail is connected there's no real account, so say so instead of inventing one. */}
        <div className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserIcon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">Demo inbox</span>
            <span className="text-xs text-muted-foreground">Gmail not connected</span>
          </span>
        </div>
      </div>
    </>
  );
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/home" onClick={onClick} className="flex items-center gap-2 px-3">
      <OscarAvatar size={28} />
      <span className="text-base font-semibold">Oscar</span>
    </Link>
  );
}

/** The menu: a sidebar on bigger screens, a top bar with a menu button on phones. */
export function Sidebar() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
        <Logo />
        <Nav />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-2 py-2 backdrop-blur md:hidden">
        <Logo />
        <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <MenuIcon />
        </Button>
      </header>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col gap-6 bg-sidebar px-3 py-3 md:hidden">
          <div className="flex items-center justify-between">
            <Logo onClick={() => setOpen(false)} />
            <Button autoFocus variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
              <XIcon />
            </Button>
          </div>
          <Nav onNavigate={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
