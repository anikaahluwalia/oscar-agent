"use client";

import { Fragment } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { EmailRow } from "@/components/review/email-row";
import type { Filter, FilterKey } from "@/components/review/filters";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { dayLabel } from "@/lib/time";
import { setHash } from "@/lib/use-hash";
import { cn } from "@/lib/utils";

/**
 * Every email Oscar has decided on, with the tabs from before (Needs you, Stopped, Finish these…),
 * for going back over older ones. Picking one opens it in Review.
 */
export function ReviewList({
  items,
  list,
  filters,
  filter,
  onFilter,
  stats,
  onBack,
}: {
  items: DecisionWithFeedback[];
  list: DecisionWithFeedback[];
  filters: Filter[];
  filter: Filter;
  onFilter: (key: FilterKey) => void;
  stats: React.ReactNode;
  onBack: () => void;
}) {
  const needs = filters.find((f) => f.key === "needs");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="-ml-3 h-11 text-[15px] font-semibold" onClick={onBack}>
          <ArrowLeftIcon /> One at a time
        </Button>
      </div>
      <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.03em]">All emails</h1>
      {stats}

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const n = items.filter(f.match).length;
          if (f.optional && !n && f.key !== filter.key) return null;
          const on = f.key === filter.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(f.key)}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-surface-hover sm:min-h-9 sm:px-3.5",
                on && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{n.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col rounded-2xl border bg-card p-2 shadow-card">
        {filter.ranked && list.length > 1 && (
          <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Check these first: the ones I was least sure of are at the top.</p>
        )}
        <ul aria-label="Emails" className="flex flex-col gap-0.5">
          {list.map((item, n) => {
            const day = dayLabel(timeOf(item));
            const heading = !filter.ranked && filter.key !== "needs" && (n === 0 || dayLabel(timeOf(list[n - 1])) !== day);
            return (
              <Fragment key={item.decision.id}>
                {heading && (
                  <li aria-hidden className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
                    {day}
                  </li>
                )}
                <EmailRow item={item} selected={false} waiting={!!needs?.match(item)} onSelect={() => setHash(item.decision.id)} />
              </Fragment>
            );
          })}
        </ul>
        {!list.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{filter.empty}</p>}
      </div>
    </div>
  );
}
