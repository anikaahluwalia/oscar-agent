"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { ActivityRow } from "@/components/activity-row";
import { StatusPill } from "@/components/status-pill";
import type { Action, DecisionWithFeedback, Level } from "@/lib/api";
import { ACTIONS, wouldOnly } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SHOWN = 20; // rows in an open group before "see all"

/** When the email arrived, or when Oscar read it for emails that don't say. */
const timeOf = (i: DecisionWithFeedback) => new Date(i.decision.gmail?.received_at ?? i.decision.created_at);

/** The start of yesterday, on this device's clock. */
function startOfYesterday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

// What he did with a group, in a few words. On the real inbox it's what he would have done.
const DID: Partial<Record<Action, [string, string]>> = {
  MARK_READ: ["Marked {n} as read", "Would mark {n} as read"],
  ARCHIVE: ["Archived {n}", "Would archive {n}"],
  APPLY_LABEL: ["Labelled {n}", "Would label {n}"],
  DRAFT_REPLY: ["Drafted {n} {replies}", "Would draft {n} {replies}"],
};

function phrase(level: Level, action: Action, n: number, readOnly: boolean) {
  const count = n.toLocaleString();
  if (level === "ESCALATE") return readOnly ? `Would hold ${count} for you` : `Held ${count} for you`;
  if (level === "ASK_FIRST") return readOnly ? `Would ask you about ${count}` : `Asked you about ${count}`;
  const words = DID[action];
  if (!words) return `${ACTIONS[action]}: ${count}`;
  return words[readOnly ? 1 : 0].replace("{n}", count).replace("{replies}", n === 1 ? "reply" : "replies");
}

type Group = { key: string; level: Level; action: Action; would: boolean; items: DecisionWithFeedback[] };

/** Only "would" unless it really happened: on the real inbox, Gmail has to say he did it. */
function wouldFor(i: DecisionWithFeedback, readOnly: boolean): boolean {
  const d = i.decision;
  if (d.source !== "gmail") return readOnly;
  if (wouldOnly(d)) return true;
  if (d.autonomy_level === "ASK_FIRST" || d.autonomy_level === "ESCALATE") return false;
  return !i.done || !!i.done.undone_at;
}

/** Groups by what he did. Asks and stops are one group each, whatever the action. */
function groups(items: DecisionWithFeedback[], readOnly: boolean): Group[] {
  const out = new Map<string, Group>();
  for (const i of items) {
    const { autonomy_level: level, action } = i.decision;
    const would = wouldFor(i, readOnly);
    const key = `${level === "ASK_FIRST" || level === "ESCALATE" ? level : `${level}:${action}`}:${would}`;
    const g = out.get(key) ?? { key, level, action, would, items: [] };
    g.items.push(i);
    out.set(key, g);
  }
  const order: Level[] = ["ESCALATE", "ASK_FIRST", "PROCEED_AND_NOTIFY", "PROCEED_SILENTLY"];
  return [...out.values()].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || b.items.length - a.items.length);
}

function GroupRow({ group, readOnly }: { group: Group; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const n = group.items.length;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left hover:bg-surface-hover"
      >
        <StatusPill level={group.level} readOnly={readOnly} />
        <span className="min-w-0 flex-1 text-sm font-medium">{phrase(group.level, group.action, n, group.would)}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="ml-4 flex flex-col border-l pl-2">
          {group.items.slice(0, SHOWN).map((i) => (
            <ActivityRow key={i.decision.id} decision={i.decision} done={i.done} />
          ))}
          {n > SHOWN && (
            <li className="px-4 py-2 text-sm">
              <Link href="/email" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {(n - SHOWN).toLocaleString()} more in All email
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** What Oscar did since yesterday, grouped, so it stays short however much email came in. */
export function SinceYesterday({ items, readOnly }: { items: DecisionWithFeedback[]; readOnly: boolean }) {
  const since = startOfYesterday();
  const recent = items.filter((i) => timeOf(i) >= since);
  if (!recent.length) {
    return <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Nothing new since yesterday.</p>;
  }
  return (
    <ul className="flex flex-col rounded-2xl border bg-card p-1.5 shadow-card">
      {groups(recent, readOnly).map((g) => (
        <GroupRow key={g.key} group={g} readOnly={readOnly} />
      ))}
    </ul>
  );
}
