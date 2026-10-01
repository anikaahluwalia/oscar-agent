// Where Oscar is for one sender and action: Ask me, Tell me or Just do it.
// It only shows the level. Feedback moves Oscar up or down, so the buttons that
// change it live next to it and say what they do (see PreferenceControls).

import { LockIcon } from "lucide-react";
import type { AutonomyRow, Level } from "@/lib/api";
import { STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const STEPS: { level: Level; label: string }[] = [
  { level: "ASK_FIRST", label: "Ask me" },
  { level: "PROCEED_AND_NOTIFY", label: "Tell me" },
  { level: "PROCEED_SILENTLY", label: "Just do it" },
];
const ORDER: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];
export const stricter = (a: Level, b: Level) => ORDER.indexOf(a) > ORDER.indexOf(b);

/** Why Oscar can't go to a step, or null if he can. */
export function lockFor(row: AutonomyRow, step: Level): string | null {
  if (row.floor && stricter(row.floor, step)) return row.floor_reason ? `Locked: ${row.floor_reason}` : "Locked by a protected rule";
  // The ceiling is the most Oscar can learn, so steps less strict than it are locked.
  if (row.ceiling && stricter(row.ceiling, step)) return "Locked: I always give you a heads up on these";
  return null;
}

export function Ladder({ row }: { row: AutonomyRow }) {
  if (row.floor === "ESCALATE") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
        <LockIcon className="size-3.5" />
        Always comes to you. {row.floor_reason && `${row.floor_reason[0].toUpperCase()}${row.floor_reason.slice(1)}.`}
      </p>
    );
  }
  return (
    <ol className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" aria-label="How much Oscar does on his own">
      {STEPS.map((step) => {
        const lock = lockFor(row, step.level);
        const current = row.level === step.level;
        return (
          <li
            key={step.level}
            title={lock ?? undefined}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
              current ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground",
              lock && "opacity-50",
            )}
          >
            {current && <span className={cn("size-2 rounded-full", STATUS[step.level].dot)} aria-hidden />}
            {lock && <LockIcon className="size-3" aria-label="Locked" />}
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
