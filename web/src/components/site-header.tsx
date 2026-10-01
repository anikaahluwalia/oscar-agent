"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OscarAvatar } from "@/components/oscar-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { loadDemoInbox, resetDemo } from "@/lib/api";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const LINKS = [{ href: "/", label: "Home" }];

export function SiteHeader() {
  const path = usePathname();

  async function run(action: () => Promise<unknown>, said: string) {
    try {
      await action();
      notifyChanged();
      oscarSays(said);
    } catch {
      oscarSays("I can't reach my API right now.");
    }
  }

  return (
    <header className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4">
      <Link href="/" className="flex items-center gap-2">
        <OscarAvatar size={30} />
        <span className="font-heading text-lg font-semibold">Oscar</span>
      </Link>
      <nav className="mr-auto flex gap-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
              path === l.href && "bg-muted text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More">
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Until Gmail is connected, the inbox is the example emails in emails/. */}
          <DropdownMenuLabel>Demo inbox</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => run(loadDemoInbox, "New emails are in. I've sorted them.")}>
            Bring in the demo emails
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => run(resetDemo, "Fresh start. I've forgotten everything.")}>
            Start over
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
