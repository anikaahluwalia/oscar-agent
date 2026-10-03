"use client";

import { useId } from "react";
import { CircleCheckIcon, HandIcon, ShieldAlertIcon } from "lucide-react";
import { impactOf, plural } from "@/lib/counts";
import { Panel } from "@/components/kit/panel";
import { Stat } from "@/components/kit/stat";
import type { DecisionWithFeedback } from "@/lib/api";
import { within } from "@/lib/insights";
import { useLocalSetting } from "@/lib/local-setting";

const PERIODS = {
  "1": "Last 24 hours",
  "7": "Last 7 days",
  "30": "Last 30 days",
} as const;
type Period = keyof typeof PERIODS;

/** What Oscar did with the emails that came in over a period you pick. Counts only, no estimates. */
export function Impact({ items, readOnly, now, className }: { items: DecisionWithFeedback[]; readOnly: boolean; now: number; className?: string }) {
  const [stored, setPeriod] = useLocalSetting<string>("home.impactDays", "7");
  const period: Period = stored in PERIODS ? (stored as Period) : "7";
  const id = useId();
  const recent = within(items, Number(period), now);
  const { emails, onOwn, asked, stopped } = impactOf(recent, readOnly);

  return (
    <Panel
      title="Your impact"
      action={
        <>
          <label htmlFor={id} className="sr-only">
            Period
          </label>
          <select
            id={id}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="-my-2 h-11 rounded-full border bg-card px-3 text-sm font-medium hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:h-9"
          >
            {Object.entries(PERIODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </>
      }
      className={className}
    >
      {emails === 0 ? (
        <p className="text-sm text-muted-foreground">No emails came in over the {PERIODS[period].toLowerCase()}.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              tone="handled"
              icon={<CircleCheckIcon className="size-4" aria-hidden />}
              value={onOwn.toLocaleString()}
              label={readOnly ? "would handle on his own" : "handled on his own"}
            />
            <Stat
              tone="needs"
              icon={<HandIcon className="size-4" aria-hidden />}
              value={asked.toLocaleString()}
              label={readOnly ? "would ask you" : "asked you"}
            />
            <Stat
              tone="blocked"
              icon={<ShieldAlertIcon className="size-4" aria-hidden />}
              value={stopped.toLocaleString()}
              label={readOnly ? "would stop" : "stopped"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Out of {plural(emails, "email", "emails")} that came in.
            {readOnly && " He's only reading Gmail, so these are what he would do."}
          </p>
        </>
      )}
    </Panel>
  );
}
