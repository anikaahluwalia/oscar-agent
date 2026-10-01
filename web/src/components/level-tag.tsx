import type { Level } from "@/lib/api";
import { LEVELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** A small coloured square and the level's name, like the confetti on wajo.ai. */
export function LevelTag({ level, className }: { level: Level; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className={cn("size-2 rounded-[2px]", LEVELS[level].square)} aria-hidden />
      {LEVELS[level].label}
    </span>
  );
}
