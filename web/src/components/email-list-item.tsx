import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { previewOf } from "@/lib/text";
import { formatTime } from "@/lib/time";
import { isOpen } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Props = { item: DecisionWithFeedback; selected: boolean; onSelect: () => void };

/** One email in a list you pick from: sender, subject, a preview and the status. */
export function EmailListItem({ item, selected, onSelect }: Props) {
  const { decision } = item;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-h-11 w-full flex-col gap-1 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-hover",
          selected && "bg-primary/8 ring-1 ring-primary/20 hover:bg-primary/10",
        )}
      >
        <span className="flex items-center gap-2">
          {/* A small dot for anything still waiting on you. */}
          {isOpen(item) && <span role="img" className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Waiting on you" />}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{decision.sender}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(timeOf(item))}</span>
        </span>
        <span className="truncate text-sm">{decision.subject}</span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {previewOf(decision) || <span className="italic opacity-70">No preview</span>}
          </span>
          <StatusPill level={decision.autonomy_level} readOnly={decision.source === "gmail"} />
        </span>
      </button>
    </li>
  );
}
