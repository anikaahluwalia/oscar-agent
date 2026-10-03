"use client";

import { useEffect, useState } from "react";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { ActivityRow } from "@/components/activity-row";
import { ActivityChips } from "@/components/activity/filter-chips";
import { EmailDetail } from "@/components/email-detail";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback, Level } from "@/lib/api";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { timeOf } from "@/lib/insights";
import { STATUS } from "@/lib/labels";
import { dayLabel } from "@/lib/time";
import { setHash, useHash } from "@/lib/use-hash";
import { isOpen, isReadOnly, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Filter = Level | "ALL";
const LEVELS: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];

/** The list, newest first, in days: [["Today", [...]], ["Yesterday", [...]], ...]. */
function byDay(items: DecisionWithFeedback[]) {
  const days: [string, DecisionWithFeedback[]][] = [];
  for (const item of items) {
    const day = dayLabel(timeOf(item));
    if (days.at(-1)?.[0] === day) days.at(-1)![1].push(item);
    else days.push([day, [item]]);
  }
  return days;
}

/** Activity: a log of everything Oscar has done (or, while he only reads Gmail, would do), with the full record of each. */
export function ActivityPage() {
  const { data, error, feedback } = useOscar();
  const hash = useHash();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  // On a phone the detail replaces the list, so start it at the top.
  useEffect(() => {
    if (hash && window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0 });
  }, [hash]);

  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const readOnly = isReadOnly(data);
  const q = query.trim().toLowerCase();
  const searched = [...data.items]
    .filter((i) => !q || `${i.decision.sender} ${i.decision.subject}`.toLowerCase().includes(q))
    .sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
  const list = filter === "ALL" ? searched : searched.filter((i) => i.decision.autonomy_level === filter);
  const chips = [
    { key: "ALL" as Filter, label: "All", count: searched.length },
    ...LEVELS.map((level) => ({
      key: level as Filter,
      label: STATUS[level].label,
      count: searched.filter((i) => i.decision.autonomy_level === level).length,
      dot: STATUS[level].dot,
    })),
  ];

  // The email in the address (/activity#<id>): his latest decision on it, or an earlier one.
  const latest = data.items.find((i) => i.decision.id === hash);
  const earlier = !latest && hash ? data.all.find((i) => i.decision.id === hash) : undefined;
  const picked = latest ?? earlier;
  const latestId = earlier ? data.items.find((i) => i.decision.email_id === earlier.decision.email_id)?.decision.id : undefined;
  // On a wide screen something is always open; on a phone the list shows until you pick one.
  const selected = picked ?? (hash ? undefined : list[0]);
  const showingDetail = !!hash;

  return (
    <Page className="max-w-7xl gap-6">
      <PageHeader
        title="Activity"
        text={
          readOnly
            ? "Everything Oscar has read, and what he would do with it. He only reads your Gmail for now."
            : "A log of everything Oscar has done."
        }
      >
        {data.gmail.connected && (
          <Button variant="outline" className="min-h-11 rounded-full px-4 sm:min-h-9" onClick={() => void checkGmail()}>
            Check now
          </Button>
        )}
      </PageHeader>

      {data.items.length === 0 ? (
        data.gmail.connected ? (
          <EmptyState
            title="Nothing read yet."
            text={
              data.gmail.auto_check_minutes
                ? `Oscar checks your inbox every ${data.gmail.auto_check_minutes} minutes, or press Check now.`
                : "Press Check now and Oscar will read your newest emails."
            }
          >
            <Button className="min-h-11 sm:min-h-9" onClick={() => void checkGmail()}>
              Check now
            </Button>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing here yet." text="Bring in the demo emails to see Oscar at work.">
            <Button className="min-h-11 sm:min-h-9" onClick={() => void bringInDemo()}>
              Bring in the demo emails
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className={cn("flex min-w-0 flex-col gap-4", showingDetail && "hidden lg:flex")}>
            <div className="relative">
              <label htmlFor="activity-search" className="sr-only">
                Search by sender or subject
              </label>
              <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="activity-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by sender or subject"
                className="h-11 w-full rounded-full border bg-card pr-4 pl-10 text-sm shadow-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <ActivityChips options={chips} value={filter} onChange={setFilter} />

            {list.length ? (
              <div className="flex flex-col gap-4 rounded-2xl border bg-card p-2 shadow-card sm:p-3">
                {byDay(list).map(([day, items], n) => (
                  <section key={day} aria-labelledby={`activity-day-${n}`} className="flex flex-col gap-0.5">
                    <h2 id={`activity-day-${n}`} className="px-3 pt-2 pb-1 text-sm font-semibold sm:px-4">
                      {day}
                    </h2>
                    <ul className="flex flex-col gap-0.5">
                      {items.map((item) => (
                        <ActivityRow
                          key={item.decision.id}
                          decision={item.decision}
                          done={item.done}
                          feedback={item.feedback}
                          waiting={isOpen(item)}
                          selected={item.decision.id === selected?.decision.id}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                <p>{q ? `Nothing from a sender or subject matching "${query.trim()}".` : `Nothing marked ${STATUS[filter as Level].label} yet.`}</p>
                <Button
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => {
                    setQuery("");
                    setFilter("ALL");
                  }}
                >
                  Show everything
                </Button>
              </div>
            )}
          </div>

          <div className={cn("min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl", !showingDetail && "hidden lg:block")}>
            {showingDetail && (
              <Button variant="ghost" className="mb-3 min-h-11 lg:hidden" onClick={() => setHash("")}>
                <ArrowLeftIcon aria-hidden /> Back to Activity
              </Button>
            )}
            {selected ? (
              <EmailDetail
                key={selected.decision.id}
                item={selected}
                data={data}
                latestId={selected === earlier ? latestId : undefined}
                onFeedback={(kind, text) => feedback(selected.decision.id, kind, text)}
              />
            ) : hash ? (
              <EmptyState title="I can't find that email." text="It may have been cleared from Oscar's history. Pick another one from the list." />
            ) : (
              <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Pick an email to see what Oscar made of it.</p>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
