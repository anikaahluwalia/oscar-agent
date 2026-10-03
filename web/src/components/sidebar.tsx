"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpenIcon,
  ChartColumnIcon,
  ChevronsUpDownIcon,
  EllipsisIcon,
  InboxIcon,
  MessageCircleIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  SquareCheckIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { OscarAvatar } from "@/components/oscar-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GmailStatus } from "@/lib/api";
import { needsReview } from "@/lib/labels";
import { isOpen, isReadOnly, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; short?: string; icon: typeof SunIcon };

// From the mock-up: the pages along the side, Settings at the bottom, then you.
const LINKS: NavItem[] = [
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/chat", label: "Chat", icon: MessageCircleIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/review", label: "Review", icon: SquareCheckIcon },
  { href: "/knows", label: "What Oscar knows", short: "Knows", icon: BookOpenIcon },
  { href: "/promises", label: "Promises", icon: ShieldIcon },
  { href: "/progress", label: "Oscar's Progress", short: "Progress", icon: ChartColumnIcon },
];
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: SlidersHorizontalIcon };
// On phones: four tabs and More.
const TABS = ["/today", "/chat", "/inbox", "/review"];

/** Waiting on you: asks and stops you haven't answered, or while Oscar only reads, calls to check. */
export function useReviewBadge() {
  const { data } = useOscar();
  if (!data) return 0;
  return isReadOnly(data) ? data.items.filter(needsReview).length : data.items.filter(isOpen).length;
}

function NavLink({ href, label, icon: Icon, count, onClick }: NavItem & { count?: number; onClick?: () => void }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
      <span className="flex-1">{label}</span>
      {!!count && <span className={cn("text-[13px] font-semibold", active ? "opacity-70" : "text-muted-foreground")}>{count > 999 ? "999+" : count}</span>}
    </Link>
  );
}

/** Your Google photo, or your initial when Google didn't share one (or before you connect). */
function Photo({ gmail, size }: { gmail?: GmailStatus; size: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (gmail?.name ?? gmail?.address ?? "?").trim().charAt(0).toUpperCase();
  if (gmail?.picture && !broken) {
    return (
      // A plain img: the photo is on Google's server, and Next's image optimiser shouldn't fetch it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={gmail.picture}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

function connectionLine(gmail?: GmailStatus) {
  if (!gmail?.connected) return "Demo inbox";
  return gmail.acting ? "Gmail connected" : "Gmail connected · read-only";
}

/** The menu behind your name: who's connected, the look, and Settings. */
function AccountMenu({ children, side }: { children: React.ReactNode; side: "top" | "bottom" }) {
  const { data } = useOscar();
  const { theme, setTheme } = useTheme();
  const gmail = data?.gmail;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={side === "top" ? "start" : "end"} className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate font-semibold">{gmail?.name ?? (gmail?.connected ? "Your Gmail" : "Not connected")}</span>
          <span className="truncate text-xs text-muted-foreground">{gmail?.address ?? "Oscar is using the demo inbox"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">Match my device</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">{gmail?.connected ? "Settings and Gmail" : "Connect Gmail"}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** You, at the bottom of the sidebar: your Google photo and name, like ChatGPT. */
function Account() {
  const { data } = useOscar();
  const gmail = data?.gmail;
  return (
    <AccountMenu side="top">
      <button
        type="button"
        aria-label={`Your account${gmail?.name ? `: ${gmail.name}` : ""}`}
        className="flex w-full items-center gap-2.5 rounded-xl border-t border-sidebar-border p-2.5 text-left hover:bg-surface-hover"
      >
        <Photo gmail={gmail} size={36} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-bold">{gmail?.name ?? gmail?.address ?? "You"}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className={cn("size-[7px] shrink-0 rounded-full", gmail?.connected ? "bg-level-silent" : "bg-muted-foreground/50")} aria-hidden />
            {connectionLine(gmail)}
          </span>
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </AccountMenu>
  );
}

function Logo() {
  return (
    <Link href="/today" className="flex items-center gap-2.5 px-3">
      <OscarAvatar size={32} />
      <span className="text-xl font-extrabold tracking-tight">Oscar</span>
    </Link>
  );
}

function Tab({ href, label, short, icon: Icon, count }: NavItem & { count?: number }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-muted-foreground",
        active && "text-foreground",
      )}
    >
      <Icon className="size-[22px]" strokeWidth={1.9} aria-hidden />
      {short ?? label}
      {!!count && (
        <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-foreground px-1 text-center text-[10px] leading-4 text-background">
          {count > 99 ? "99+" : count}
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
        className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-muted-foreground", active && "text-foreground")}
      >
        <EllipsisIcon className="size-[22px]" aria-hidden />
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

/** The menu: a sidebar on bigger screens; on phones, a slim top bar with your photo, and tabs along the bottom. */
export function Sidebar() {
  const count = useReviewBadge();
  const { data } = useOscar();
  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-[232px] shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar px-3.5 py-6 md:flex">
        <div className="pb-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {LINKS.map((l) => (
            <NavLink key={l.href} {...l} count={l.href === "/review" ? count : undefined} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          <NavLink {...SETTINGS} />
          <Account />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-2 py-2.5 backdrop-blur md:hidden">
        <Logo />
        <AccountMenu side="bottom">
          <button type="button" aria-label="Your account" className="rounded-full p-1.5">
            <Photo gmail={data?.gmail} size={34} />
          </button>
        </AccountMenu>
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {LINKS.filter((l) => TABS.includes(l.href)).map((l) => (
          <Tab key={l.href} {...l} count={l.href === "/review" ? count : undefined} />
        ))}
        <More />
      </nav>
    </>
  );
}
