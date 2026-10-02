"use client";

import { ActivityRow } from "@/components/activity-row";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader } from "@/components/page";
import type { DecisionWithFeedback } from "@/lib/api";
import { dayLabel } from "@/lib/time";
import { useOscar } from "@/lib/use-oscar";

/** Newest first, grouped by day. */
function byDay(items: DecisionWithFeedback[]) {
  const days = new Map<string, DecisionWithFeedback[]>();
  for (const item of items) {
    const day = dayLabel(item.decision.created_at);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return [...days.entries()];
}

export function ActivityPage() {
  const { data, error } = useOscar();
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Activity" text="Everything Oscar has done, suggested, or stopped." />
      {!data ? (
        <Loading error={error} />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing yet." text="Once emails come in, everything Oscar does is logged here." />
      ) : (
        byDay(data.items).map(([day, items]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="px-4 text-sm font-medium text-muted-foreground">{day}</h2>
            <ul className="flex flex-col rounded-2xl border bg-card shadow-card p-1.5">
              {items.map((i) => (
                <ActivityRow key={i.decision.id} decision={i.decision} />
              ))}
            </ul>
          </section>
        ))
      )}
    </Page>
  );
}
