"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { CategoryPill, categoryOf } from "@/components/classify/category-pill";
import { TypePill } from "@/components/classify/type-pill";
import { FilterPills } from "@/components/inbox/filter-pills";
import { InboxLink } from "@/components/inbox/inbox-link";
import { InboxRow } from "@/components/inbox/inbox-row";
import { OscarNote } from "@/components/inbox/oscar-note";
import { didIt } from "@/components/inbox/outcome";
import { WhatItIs } from "@/components/inbox/what-it-is";
import { EmailPreview } from "@/components/kit/email-preview";
import { OscarMood } from "@/components/oscar-mood";
import { Loading, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback } from "@/lib/api";
import { waiting } from "@/lib/counts";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { timeOf } from "@/lib/insights";
import { isSafetyStop, wouldOnly } from "@/lib/labels";
import { dayLabel } from "@/lib/time";
import { setHash, useHash } from "@/lib/use-hash";
import { isReadOnly, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "DONE" | "WAITING" | "HELD";
const PAGE = 50; // rows at a time, so a big inbox stays quick
const ON_OWN = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);

/**
 * What he took care of. Only what really happened (didIt, or Gmail's record of an ask you
 * approved); for a decision made while he only read Gmail, what he would have handled on his own.
 */
function tookCare({ decision: d, done, feedback }: DecisionWithFeedback) {
  if (wouldOnly(d)) return ON_OWN.has(d.autonomy_level);
  return didIt(d, done, feedback) || (d.source === "gmail" && !!done && !done.undone_at);
}

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

const noSubscribe = () => () => {};

/** Inbox: every email Oscar has read and what he did with it (or, while he only reads Gmail, would do). */
export function InboxPage() {
  const { data, error, feedback } = useOscar();
  const hash = useHash();
  // "See all" from Today's list of what he took care of opens on that filter (/inbox?show=done),
  // until you pick another.
  const show = useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).get("show"), () => null);
  const [chosen, setFilter] = useState<Filter | null>(null);
  const filter: Filter = chosen ?? (show === "done" ? "DONE" : "ALL");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(""); // one of your categories, or "" for every email
  const [limit, setLimit] = useState(PAGE);

  // On a phone the email replaces the list, so start it at the top.
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
  const waitingIds = new Set(waiting(data).map((i) => i.decision.id));
  const q = query.trim().toLowerCase();
  const inCategory = data.categories.find((c) => c.id === category);
  const searched = data.items
    .filter((i) => !q || `${i.decision.sender} ${i.decision.subject}`.toLowerCase().includes(q))
    .filter((i) => !inCategory || categoryOf([inCategory], i.decision.sender))
    .sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
  const tests: Record<Filter, (i: DecisionWithFeedback) => boolean> = {
    ALL: () => true,
    DONE: tookCare,
    WAITING: (i) => waitingIds.has(i.decision.id),
    HELD: (i) => isSafetyStop(i.decision), // only what a safety rule stopped
  };
  const list = searched.filter(tests[filter]);
  const pills: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: searched.length },
    { key: "DONE", label: readOnly ? "I'd take care of" : "I took care of", count: searched.filter(tests.DONE).length },
    { key: "WAITING", label: "Waiting on you", count: searched.filter(tests.WAITING).length },
    { key: "HELD", label: "Held back", count: searched.filter(tests.HELD).length },
  ];
  const nothing: Record<Filter, string> = {
    ALL: "",
    DONE: readOnly ? "Nothing I'd take care of on my own yet." : "I haven't taken care of anything yet.",
    WAITING: "Nothing is waiting on you. All clear!",
    HELD: "I haven't held anything back.",
  };

  // The email in the address (/inbox#<id>): his latest decision on it, or an earlier one.
  const latest = data.items.find((i) => i.decision.id === hash);
  const earlier = !latest && hash ? data.all.find((i) => i.decision.id === hash && !i.gone) : undefined;
  const picked = latest ?? earlier;
  const latestId = earlier ? data.items.find((i) => i.decision.email_id === earlier.decision.email_id)?.decision.id : undefined;
  // On a wide screen something is always open; on a phone the list shows until you pick one.
  const selected = picked ?? (hash ? undefined : list[0]);
  const showingDetail = !!hash;
  // Keep the open email in the list, even when it's further down than "Show more" has reached.
  const shown = Math.max(limit, list.findIndex((i) => i.decision.id === selected?.decision.id) + 1);

  const pick = (key: Filter) => {
    setFilter(key);
    setLimit(PAGE);
  };

  return (
    <Page className="max-w-7xl gap-5 sm:px-7">
      <header className={cn("flex flex-wrap items-end justify-between gap-4", showingDetail && "hidden lg:flex")}>
        <div className="flex flex-col gap-1">
          <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em]">Inbox</h1>
          <p className="text-[15px] text-muted-foreground">
            {readOnly ? "Every email, and what I'd do with it. I only read your Gmail for now." : "Every email, and what I did with it."}
          </p>
        </div>
        {data.items.length > 0 && <FilterPills options={pills} value={filter} onChange={pick} />}
      </header>

      {data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <OscarMood pose="sleeping" size={96} />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{data.gmail.connected ? "Nothing read yet." : "Nothing here yet."}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {!data.gmail.connected
                ? "Bring in the demo emails to see me at work."
                : data.gmail.auto_check_minutes
                  ? `I check your inbox every ${data.gmail.auto_check_minutes} minutes on my own.`
                  : "Press Check now and I'll read your newest emails."}
            </p>
          </div>
          {!(data.gmail.connected && data.gmail.auto_check_minutes) && (
            <Button className="min-h-11 px-4 sm:min-h-9" onClick={() => void (data.gmail.connected ? checkGmail() : bringInDemo())}>
              {data.gmail.connected ? "Check now" : "Bring in the demo emails"}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className={cn("flex min-w-0 flex-col gap-3", showingDetail && "hidden lg:flex")}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <label htmlFor="inbox-search" className="sr-only">
                  Search by sender or subject
                </label>
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="inbox-search"
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(PAGE);
                  }}
                  placeholder="Search by sender or subject"
                  className="h-11 w-full rounded-full border bg-card pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              {data.categories.length > 0 && (
                <>
                  <label htmlFor="inbox-category" className="sr-only">
                    Show one of your categories
                  </label>
                  <select
                    id="inbox-category"
                    value={inCategory ? category : ""}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setLimit(PAGE);
                    }}
                    className="h-11 max-w-40 shrink-0 rounded-full border bg-card px-3.5 text-sm font-medium outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">All categories</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {list.length ? (
              <div className="flex flex-col gap-0.5">
                {byDay(list.slice(0, shown)).map(([day, items], n) => (
                  <section key={day} aria-labelledby={`inbox-day-${n}`} className="flex flex-col gap-0.5">
                    <h2 id={`inbox-day-${n}`} className={cn("px-4 pb-1.5 text-xs font-bold text-muted-foreground", n ? "pt-3.5" : "pt-1.5")}>
                      {day}
                    </h2>
                    <ul aria-label={`Emails, ${day}`} className="flex flex-col gap-0.5">
                      {items.map((item) => (
                        <InboxRow
                          key={item.decision.id}
                          item={item}
                          selected={item.decision.id === selected?.decision.id && (picked ? true : "wide")}
                          waiting={waitingIds.has(item.decision.id)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
                {list.length > shown && (
                  <Button variant="outline" className="mt-3 min-h-11 self-center rounded-full px-5 font-semibold" onClick={() => setLimit(shown + PAGE)}>
                    Show more ({(list.length - shown).toLocaleString()} left)
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                <p>
                  {q
                    ? `Nothing from a sender or subject matching "${query.trim()}".`
                    : inCategory && filter === "ALL"
                      ? `No emails from senders in ${inCategory.name} yet.`
                      : nothing[filter]}
                </p>
                <Button
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => {
                    setQuery("");
                    setCategory("");
                    pick("ALL");
                  }}
                >
                  Show everything
                </Button>
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:rounded-[22px]",
              !showingDetail && "hidden lg:flex",
            )}
          >
            {showingDetail && (
              <Button variant="ghost" className="min-h-11 self-start px-3 lg:hidden" onClick={() => setHash("")}>
                <ArrowLeftIcon aria-hidden /> Back to Inbox
              </Button>
            )}
            {selected ? (
              <article key={selected.decision.id} aria-label={selected.decision.subject || "The email"} className="flex flex-col gap-4">
                {latestId && (
                  <p className="rounded-[18px] border bg-card px-4 py-3 text-sm">
                    This is an earlier decision. I read this email again later.{" "}
                    <InboxLink id={latestId} className="font-semibold underline underline-offset-4">
                      See my latest
                    </InboxLink>
                  </p>
                )}
                <OscarNote item={selected} canExplain={selected !== earlier} onFeedback={(kind, text, scope, level) => feedback(selected.decision.id, kind, text, scope, level)} />
                <EmailPreview
                  decision={selected.decision}
                  aside={
                    <>
                      <TypePill item={selected} />
                      <CategoryPill sender={selected.decision.sender} />
                    </>
                  }
                />
                <WhatItIs item={selected} />
              </article>
            ) : hash ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
                <p className="font-semibold">I can&apos;t find that email.</p>
                <p className="max-w-sm text-sm text-muted-foreground">It may have been deleted in Gmail, or cleared from my history. Pick another one from the list.</p>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Pick an email to see what I made of it.</p>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
