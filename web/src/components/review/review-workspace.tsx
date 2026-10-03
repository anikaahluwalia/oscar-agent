"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { DecisionPanel } from "@/components/review/decision-panel";
import { SenderAvatar } from "@/components/review/sender-avatar";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { sendReview, type DecisionWithFeedback } from "@/lib/api";
import { ACTIONS, isOldWay, needsReview } from "@/lib/labels";
import { previewOf } from "@/lib/text";
import { dayLabel, formatTime } from "@/lib/time";
import { setHash, useHash } from "@/lib/use-hash";
import { notifyChanged, oscarSays } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Filter = "first" | "all" | "unsure" | "new" | "lists" | "stopped" | "finish";

const LIST_TABS = new Set(["promotions", "updates", "social", "forums"]);
const LIST_KINDS = new Set(["marketing", "newsletter", "job_alert", "social_notification", "bulk", "promotion"]);

/**
 * How much reviewing this email would teach: what he couldn't read at all first, then what
 * he wasn't sure of, then senders he's never seen. Old half-answers come last, since you
 * already said he got those wrong. Ties go to the newest.
 */
function priority(i: DecisionWithFeedback, firstSeen: Set<string>): number {
  const d = i.decision;
  if (isOldWay(i.review)) return 5;
  if (d.level_source === "guess") return 0;
  if ((d.confidence ?? 0) < 0.7) return 1;
  if (firstSeen.has(d.id)) return 2;
  if (d.autonomy_level === "ESCALATE") return 3;
  return 4;
}

const when = (i: DecisionWithFeedback) => i.decision.gmail?.received_at ?? i.decision.created_at;

function Row({ item, selected, onSelect }: { item: DecisionWithFeedback; selected: boolean; onSelect: () => void }) {
  const d = item.decision;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-2xl border border-transparent px-4 py-3.5 text-left transition-colors hover:bg-surface-hover",
          selected && "border-foreground/80 bg-card shadow-card hover:bg-card",
        )}
      >
        <span className="relative">
          <SenderAvatar sender={d.sender} size={36} />
          {needsReview(item) && <span className="absolute -top-0.5 -left-0.5 size-2.5 rounded-full border-2 border-background bg-foreground" aria-label="To review" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{d.sender}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(when(item))}</span>
          </span>
          <span className="block truncate font-medium">{d.subject}</span>
          <span className="block truncate text-sm text-muted-foreground">{previewOf(d)}</span>
        </span>
        <span className="hidden w-28 shrink-0 flex-col items-end gap-1 sm:flex">
          <StatusPill level={d.autonomy_level} />
          <span className="text-xs text-muted-foreground">{ACTIONS[d.action]}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Checking Oscar's calls on your inbox: filters along the top, the emails on the left, the open
 * one on the right with his decision, his reasons, the safety checks and your answer.
 * Keys: J and K move, Y says he got it right.
 */
export function ReviewWorkspace({ items }: { items: DecisionWithFeedback[] }) {
  const hash = useHash();
  const waiting = items.filter(needsReview).length;
  const [filter, setFilter] = useState<Filter>(waiting ? "first" : "all");

  const firstSeen = useMemo(() => {
    const seen = new Map<string, DecisionWithFeedback>();
    for (const i of [...items].sort((a, b) => when(a).localeCompare(when(b)))) {
      if (!seen.has(i.decision.sender)) seen.set(i.decision.sender, i);
    }
    // A sender with only one email so far.
    const counts = new Map<string, number>();
    items.forEach((i) => counts.set(i.decision.sender, (counts.get(i.decision.sender) ?? 0) + 1));
    return new Set([...seen.values()].filter((i) => counts.get(i.decision.sender) === 1).map((i) => i.decision.id));
  }, [items]);

  const filters: { key: Filter; label: string; match: (i: DecisionWithFeedback) => boolean }[] = [
    { key: "first", label: "Check these first", match: (i) => needsReview(i) && !isOldWay(i.review) },
    { key: "all", label: "All", match: () => true },
    { key: "unsure", label: "Unsure", match: (i) => i.decision.level_source === "guess" || (i.decision.confidence ?? 0) < 0.7 },
    { key: "new", label: "New senders", match: (i) => firstSeen.has(i.decision.id) },
    { key: "lists", label: "Promos and lists", match: (i) => LIST_TABS.has(i.decision.gmail?.category ?? "") || LIST_KINDS.has(i.decision.email_type ?? "") },
    { key: "stopped", label: "Stopped", match: (i) => i.decision.autonomy_level === "ESCALATE" },
    { key: "finish", label: "Finish these", match: (i) => isOldWay(i.review) },
  ];
  const active = filters.find((f) => f.key === filter) ?? filters[1];
  const list = items
    .filter(active.match)
    .sort((a, b) => (filter === "first" ? priority(a, firstSeen) - priority(b, firstSeen) : 0) || when(b).localeCompare(when(a)));
  const picked = items.find((i) => i.decision.id === hash);
  const selected = picked ?? list[0];

  // Keyboard: J / K to move through the list, Y to say Oscar got it right. Not while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, [contenteditable]")) return;
      const at = selected ? list.findIndex((i) => i.decision.id === selected.decision.id) : -1;
      if (e.key === "j" && list[at + 1]) setHash(list[at + 1].decision.id);
      if (e.key === "k" && at > 0) setHash(list[at - 1].decision.id);
      if (e.key === "y" && selected && !selected.review) {
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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {filters.map((f) => {
          const n = items.filter(f.match).length;
          if (!n && f.key !== "all" && f.key !== filter) return null;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium hover:bg-surface-hover",
                filter === f.key && "border-transparent bg-foreground text-background hover:bg-foreground",
              )}
            >
              {f.label}
              <span className={cn("tabular-nums", filter === f.key ? "text-background/70" : "text-muted-foreground")}>{n.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <ul className={cn("flex min-w-0 flex-col gap-1", picked && "hidden lg:flex")} aria-label="Emails">
          {list.map((item, n) => {
            const day = dayLabel(when(item));
            const heading = filter !== "first" && (n === 0 || dayLabel(when(list[n - 1])) !== day);
            return (
              <Fragment key={item.decision.id}>
                {heading && <li aria-hidden className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground">{day}</li>}
                <Row item={item} selected={item.decision.id === selected?.decision.id} onSelect={() => setHash(item.decision.id)} />
              </Fragment>
            );
          })}
          {!list.length && <li className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Nothing here.</li>}
          <li className="hidden px-4 pt-2 text-xs text-muted-foreground lg:block">Keys: J and K to move, Y if Oscar got it right.</li>
        </ul>

        <div className={cn("min-w-0", !picked && "hidden lg:block")}>
          <div className="lg:sticky lg:top-6">
            {picked && (
              <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={() => setHash("")}>
                <ArrowLeftIcon /> All calls
              </Button>
            )}
            {selected && <DecisionPanel item={selected} />}
          </div>
        </div>
      </div>
    </div>
  );
}
