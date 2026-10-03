import type { Level } from "@/lib/api";
import { cn } from "@/lib/utils";

const DOT: Record<Level, string> = {
  PROCEED_SILENTLY: "bg-level-silent",
  PROCEED_AND_NOTIFY: "bg-level-notify",
  ASK_FIRST: "bg-level-ask",
  ESCALATE: "bg-level-escalate",
};

const TEXT: Record<Level, string> = {
  PROCEED_SILENTLY: "text-status-handled",
  PROCEED_AND_NOTIFY: "text-status-fyi",
  ASK_FIRST: "text-status-needs",
  ESCALATE: "text-status-blocked",
};

/** A coloured dot for one of Oscar's levels. */
export function LevelDot({ level, className }: { level: Level; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[level], className)} />;
}

/** A dot and a few words in the level's colour: "Marked as read", "Asking you", "Held back". */
export function StatusWords({ level, children, className }: { level: Level; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold", TEXT[level], className)}>
      <LevelDot level={level} />
      {children}
    </span>
  );
}
