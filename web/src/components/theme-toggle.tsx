"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    // The label can't depend on the theme: the server doesn't know it, so it would differ after hydration.
    <Button variant="ghost" size="icon" aria-label="Switch light or dark mode" onClick={() => setTheme(dark ? "light" : "dark")}>
      {/* Both icons render; CSS picks one, so the server and client agree before the theme is known. */}
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="block dark:hidden" />
    </Button>
  );
}
