import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback } from "@/lib/api";
import { formatTime } from "@/lib/time";
import { isOpen } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Props = { item: DecisionWithFeedback; selected: boolean; onSelect: () => void };

export function EmailListItem({ item, selected, onSelect }: Props) {
  const { decision } = item;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-hover",
          selected && "bg-surface-hover",
        )}
      >
        <span className="flex items-center gap-2">
          {/* A small dot for anything still waiting on you. */}
          {isOpen(item) && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="Waiting on you" />}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{decision.sender}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(decision.created_at)}</span>
        </span>
        <span className="truncate text-sm">{decision.subject}</span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{decision.snippet}</span>
          <StatusPill level={decision.autonomy_level} />
        </span>
      </button>
    </li>
  );
}
