import Link from "next/link";
import type { Level } from "@/lib/api";
import { STATUS } from "@/lib/labels";
import type { Counts } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const ORDER: { level: Level; href: string }[] = [
  { level: "PROCEED_SILENTLY", href: "/activity" },
  { level: "PROCEED_AND_NOTIFY", href: "/activity" },
  { level: "ASK_FIRST", href: "/needs-you" },
  { level: "ESCALATE", href: "/needs-you" },
];

/** A row of small counts: 3 Handled · 1 FYI · 0 Needs You · 0 Blocked. */
export function StatusSummary({ counts }: { counts: Counts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ORDER.map(({ level, href }) => (
        <Link
          key={level}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-surface-hover",
            !counts[level] && "text-muted-foreground",
          )}
        >
          <span className={cn("size-2 rounded-full", STATUS[level].dot, !counts[level] && "opacity-40")} aria-hidden />
          <span className="font-semibold tabular-nums">{counts[level]}</span>
          {STATUS[level].label}
        </Link>
      ))}
    </div>
  );
}
