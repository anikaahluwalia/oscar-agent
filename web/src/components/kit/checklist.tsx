import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A list of checks, ticked green when they passed and crossed red when something was found. */
export function Checklist({ items, className }: { items: { label: string; ok: boolean }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-1.5 text-sm", className)}>
      {items.map((c) => (
        <li key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-muted-foreground" : "font-medium text-status-blocked")}>
          {c.ok ? <CheckIcon className="size-4 shrink-0 text-status-handled" aria-label="Passed" /> : <XIcon className="size-4 shrink-0" aria-label="Found" />}
          {c.label}
        </li>
      ))}
    </ul>
  );
}
