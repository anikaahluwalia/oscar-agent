"use client";

import Link from "next/link";
import { didLine } from "@/components/activity/outcome";
import { RowIcon } from "@/components/activity/row-icon";
import { StatusPill } from "@/components/status-pill";
import type { ActionDone, Decision, FeedbackEvent } from "@/lib/api";
import { formatTime } from "@/lib/time";
import { setHash } from "@/lib/use-hash";
import { cn } from "@/lib/utils";

type Props = {
  decision: Decision;
  done?: ActionDone | null;
  /** Your answers, so an undone demo action reads as undone. */
  feedback?: FeedbackEvent[];
  /** The one open in Activity. */
  selected?: boolean;
  /** Still waiting on you: shows a small dot. */
  waiting?: boolean;
};

/**
 * One line of Oscar's log: when, what he did, who it's from, and the status.
 * Opens the email in Activity. Next changes a same-page #hash without a hashchange
 * event, so on /activity itself we set the hash ourselves (like EmailLink).
 */
export function ActivityRow({ decision, done, feedback, selected, waiting }: Props) {
  const time = formatTime(decision.gmail?.received_at ?? decision.created_at);
  return (
    <li>
      <Link
        href={`/activity#${decision.id}`}
        aria-current={selected ? "true" : undefined}
        onClick={(e) => {
          if (window.location.pathname === "/activity") {
            e.preventDefault();
            setHash(decision.id);
          }
        }}
        className={cn(
          "grid min-h-14 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-hover sm:grid-cols-[4.25rem_1rem_minmax(0,1fr)_auto] sm:px-4",
          selected && "bg-primary/8 ring-1 ring-primary/20 hover:bg-primary/10",
        )}
      >
        <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">{time}</span>
        <RowIcon decision={decision} done={done} feedback={feedback} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {waiting && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Waiting on you" role="img" />}
            <span className="truncate text-sm font-medium">{didLine(decision, done, feedback)}</span>
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {decision.sender} · {decision.subject}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusPill level={decision.autonomy_level} readOnly={decision.source === "gmail"} />
          <span className="text-xs tabular-nums text-muted-foreground sm:hidden">{time}</span>
        </span>
      </Link>
    </li>
  );
}
