import type { Level } from "@/lib/api";
import { STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function StatusPill({ level, className }: { level: Level; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", STATUS[level].pill, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS[level].label}
    </span>
  );
}
