"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { DecisionPanel } from "@/components/review/decision-panel";
import { EmailPane } from "@/components/review/email-pane";
import { EmailRow } from "@/components/review/email-row";
import { filtersFor, listFor, newSenders, type FilterKey } from "@/components/review/filters";
import { Button } from "@/components/ui/button";
import { sendReview, type DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { dayLabel } from "@/lib/time";
import { setHash, useHash } from "@/lib/use-hash";
import { notifyChanged, oscarSays, type useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Feedback = ReturnType<typeof useOscar>["feedback"];

/** The tab to open on: what needs you, else his calls still to check, else everything. */
function startOn(counts: Map<FilterKey, number>): FilterKey {
  if (counts.get("needs")) return "needs";
  if (counts.get("check")) return "check";
  return "all";
}

/**
 * Reviewing Oscar's decisions: tabs along the top, the emails on the left, the open one in the
 * middle and his decision on the right, with your controls. On phones the list and the open email
 * take turns, picked by the address (#id) so the back button works.
 * Keys: J and K move, Y says he got it right (real inbox).
 */
export function ReviewWorkspace({
  items,
  real,
  readOnly,
  canAct,
  feedback,
  stats,
}: {
  items: DecisionWithFeedback[];
  /** These are emails from your Gmail, not the demo inbox. */
  real: boolean;
  /** Oscar only reads your Gmail. */
  readOnly: boolean;
  /** Oscar acts in Gmail. */
  canAct: boolean;
  feedback: Feedback;
  /** The stats line, shown above the tabs (not on phones while an email is open). */
  stats?: React.ReactNode;
}) {
  const hash = useHash();
  const filters = useMemo(() => filtersFor({ real, readOnly }), [real, readOnly]);
  const counts = useMemo(() => new Map(filters.map((f) => [f.key, items.filter(f.match).length])), [filters, items]);
  // Picked once, so the tab doesn't jump away when you answer the last email in it.
  const [chosen, setChosen] = useState<FilterKey>(() => startOn(counts));
  const filter = filters.find((f) => f.key === chosen) ?? filters[0];
  const needs = filters.find((f) => f.key === "needs");

  const firstSeen = useMemo(() => newSenders(items), [items]);
  const list = useMemo(() => listFor(items, filter, firstSeen), [items, filter, firstSeen]);
  const picked = items.find((i) => i.decision.id === hash);
  const selected = picked ?? list[0];
  const selectedId = selected?.decision.id;

  // Keep the open email in view in the list as J and K move through it. On phones, where the
  // email replaces the list, start it at the top. Only when the open email changes, not on every
  // refresh (the data reloads in the background, which would jump you back up mid-answer).
  const opened = !!picked;
  useEffect(() => {
    if (!selectedId) return;
    if (opened && window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0 });
    else document.getElementById(`review-row-${selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, opened]);

  // Keyboard: J / K to move through the list, Y to say Oscar got it right. Not while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      const at = selected ? list.findIndex((i) => i.decision.id === selected.decision.id) : -1;
      const key = e.key.toLowerCase();
      if (key === "j" && list[at + 1]) setHash(list[at + 1].decision.id);
      else if (key === "k" && at > 0) setHash(list[at - 1].decision.id);
      else if (key === "y" && selected && selected.decision.source === "gmail" && !selected.review) {
        sendReview({ decision_id: selected.decision.id, label: "CORRECT" })
          .then(() => {
            notifyChanged();
            if (list[at + 1]) setHash(list[at + 1].decision.id);
          })
          .catch((err) => oscarSays(err instanceof Error ? err.message : "Something went wrong."));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, selected]);

  return (
    <div className="flex flex-col gap-4">
      {stats && <div className={cn(picked && "hidden lg:block")}>{stats}</div>}
      <div role="group" aria-label="Show" className={cn("flex flex-wrap gap-2", picked && "hidden lg:flex")}>
        {filters.map((f) => {
          const n = counts.get(f.key) ?? 0;
          if (f.optional && !n && f.key !== filter.key) return null;
          const on = f.key === filter.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setChosen(f.key)}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium hover:bg-surface-hover sm:min-h-9 sm:px-3.5",
                on && "border-transparent bg-primary/10 text-primary hover:bg-primary/15",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{n.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,23rem)]">
        <div
          className={cn(
            "flex min-w-0 flex-col rounded-2xl border bg-card p-2 shadow-card lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto",
            picked && "hidden lg:flex",
          )}
        >
          {filter.ranked && list.length > 1 && (
            <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Check these first: the ones he was least sure of are at the top.</p>
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
                  <EmailRow
                    id={`review-row-${item.decision.id}`}
                    item={item}
                    selected={item.decision.id === selectedId}
                    waiting={!!needs?.match(item)}
                    onSelect={() => setHash(item.decision.id)}
                  />
                </Fragment>
              );
            })}
          </ul>
          {!list.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{filter.empty}</p>}
          {list.length > 0 && (
            <p className="hidden px-3 pt-3 pb-2 text-xs text-muted-foreground lg:block">
              {real ? "Keys: J and K to move, Y if Oscar got it right." : "Keys: J and K to move."}
            </p>
          )}
        </div>

        {selected ? (
          <div className={cn("flex min-w-0 flex-col gap-4 xl:contents", !picked && "hidden lg:flex")}>
            {picked && (
              <Button variant="ghost" className="h-11 self-start lg:hidden" onClick={() => setHash("")}>
                <ArrowLeftIcon /> All emails
              </Button>
            )}
            <EmailPane item={selected} />
            <DecisionPanel item={selected} canAct={canAct} feedback={feedback} />
          </div>
        ) : (
          <p className="hidden rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground lg:block">
            Pick an email to see what Oscar made of it.
          </p>
        )}
      </div>
    </div>
  );
}
