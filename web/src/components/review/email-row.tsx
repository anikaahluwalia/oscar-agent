import { displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import { outcomeOf } from "@/components/review/filters";
import type { DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { shownLevel, STATUS } from "@/lib/labels";
import { previewOf } from "@/lib/text";
import { dayLabel, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/** The time for today's emails, else "Yesterday" or the date. */
export function shortWhen(iso: string) {
  const day = dayLabel(iso);
  return day === "Today" ? formatTime(iso) : day;
}

/** One email in the Review list: who it's from, the subject, a preview, and Oscar's call. */
export function EmailRow({
  id,
  item,
  selected,
  waiting,
  onSelect,
}: {
  id?: string;
  item: DecisionWithFeedback;
  selected: boolean;
  /** In Needs you: shows a blue dot. */
  waiting: boolean;
  onSelect: () => void;
}) {
  const d = item.decision;
  const name = displayName(d.sender);
  return (
    <li>
      <button
        id={id}
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring",
          selected && "bg-primary/8 hover:bg-primary/10",
        )}
      >
        {selected && <span className="absolute inset-y-2 right-0 w-1 rounded-full bg-primary" aria-hidden />}
        <span className="relative">
          <SenderAvatar sender={d.sender} size={36} />
          {waiting && (
            <span className="absolute -top-0.5 -left-0.5 size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{shortWhen(timeOf(item))}</span>
          </span>
          <span className={cn("truncate text-sm", selected ? "font-medium text-primary" : "text-foreground")}>{d.subject || "(no subject)"}</span>
          <span className="truncate text-xs text-muted-foreground">{previewOf(d)}</span>
          <span className="mt-1 flex min-w-0 items-center gap-2">
            <StatusWords level={shownLevel(d)} className="shrink-0 text-xs">{STATUS[shownLevel(d)].label}</StatusWords>
            <span className="truncate text-xs text-muted-foreground">{outcomeOf(item)}</span>
          </span>
        </span>
        {waiting && <span className="sr-only">Needs you.</span>}
      </button>
    </li>
  );
}
