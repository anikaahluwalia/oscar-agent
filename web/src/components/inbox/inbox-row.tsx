import { didLine } from "@/components/inbox/outcome";
import { InboxLink } from "@/components/inbox/inbox-link";
import { displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import type { DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * One email in the list: who, when, the subject, and what Oscar did with it. `selected` is the open email;
 * "wide" when it's only open because it's first, which a phone doesn't show. `waiting` adds the dot.
 */
export function InboxRow({ item, selected, waiting }: { item: DecisionWithFeedback; selected: boolean | "wide"; waiting: boolean }) {
  const { decision: d, done, feedback } = item;
  return (
    <li>
      <InboxLink
        id={d.id}
        aria-current={selected === true ? "true" : undefined}
        className={cn(
          "flex gap-3 rounded-2xl px-4 py-3.5 text-foreground transition-colors hover:bg-surface-hover",
          selected === true && "bg-card shadow-card ring-1 ring-border hover:bg-card",
          selected === "wide" && "lg:bg-card lg:shadow-card lg:ring-1 lg:ring-border lg:hover:bg-card",
        )}
      >
        <SenderAvatar sender={d.sender} size={38} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              {waiting && <span role="img" aria-label="Waiting on you" className="size-2 shrink-0 rounded-full bg-primary" />}
              <b className="truncate">{displayName(d.sender)}</b>
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{formatTime(timeOf(item))}</span>
          </span>
          <span className="truncate text-sm">{d.subject || "(no subject)"}</span>
          <StatusWords level={d.autonomy_level} className="text-xs">
            {didLine(d, done, feedback)}
          </StatusWords>
        </span>
      </InboxLink>
    </li>
  );
}
