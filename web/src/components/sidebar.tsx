"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HistoryIcon, HouseIcon, SettingsIcon } from "lucide-react";
import { OscarAvatar } from "@/components/oscar-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/activity", label: "Activity", icon: HistoryIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

/** The menu: down the side on bigger screens, along the bottom on phones. */
export function Sidebar() {
  const path = usePathname();

  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-8 bg-card/50 px-4 py-6 md:flex">
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2">
            <OscarAvatar size={32} />
            <span className="font-heading text-xl font-semibold">Oscar</span>
          </Link>
          <ThemeToggle />
        </div>
        <nav className="flex flex-col gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground",
                path === href && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around bg-background/90 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs text-muted-foreground",
              path === href && "text-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
