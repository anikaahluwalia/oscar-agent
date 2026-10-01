"use client";

import { useTheme } from "next-themes";
import { Autonomy } from "@/components/autonomy";
import { Button } from "@/components/ui/button";
import { bringInDemo, startOver } from "@/lib/demo";
import { cn } from "@/lib/utils";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Settings() {
  const { resolvedTheme, setTheme } = useTheme();
  // The selected look comes from CSS (dark:), so the server and the browser render the same thing.
  const pill = "rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 pt-8 pb-16 sm:px-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Settings</h1>

      <Autonomy />

      <Group title="Look">
        <div className="flex w-fit gap-1 rounded-full bg-card p-1">
          <button type="button" suppressHydrationWarning aria-pressed={resolvedTheme ? resolvedTheme !== "light" : undefined} onClick={() => setTheme("dark")} className={cn(pill, "dark:bg-muted dark:text-foreground")}>
            Dark
          </button>
          <button type="button" suppressHydrationWarning aria-pressed={resolvedTheme ? resolvedTheme === "light" : undefined} onClick={() => setTheme("light")} className={cn(pill, "bg-muted text-foreground dark:bg-transparent dark:text-muted-foreground")}>
            Light
          </button>
        </div>
      </Group>

      <Group title="Demo inbox">
        <p className="text-sm text-muted-foreground">Until Gmail is connected, Oscar works on a set of example emails.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={bringInDemo}>Bring in the demo emails</Button>
          <Button variant="outline" onClick={startOver}>Start over</Button>
        </div>
      </Group>
    </main>
  );
}
