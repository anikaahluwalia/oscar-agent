"use client";

import { useState } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { EmailLink } from "@/components/email-link";
import { Panel } from "@/components/kit/panel";
import type { DecisionWithFeedback } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { safetyEvents, timeOf } from "@/lib/insights";
import { FLAGS, LEVEL_SOURCES, whatOscarDid } from "@/lib/labels";
import { dayLabel, formatTime } from "@/lib/time";
import { isOpen } from "@/lib/use-oscar";

const SHOWN = 5;

/** "Jane Doe <jane@x.com>" as "Jane Doe". */
const nameOf = (sender: string) => sender.replace(/<.*>/, "").replace(/"/g, "").trim() || sender;

/** Why it was stopped: the checks that matched, or the step that decided it when none did. */
function reasonsOf(i: DecisionWithFeedback) {
  const flags = i.decision.safety_flags.map((f) => FLAGS[f] ?? f.toLowerCase().replace(/_/g, " "));
  return flags.length ? flags : [LEVEL_SOURCES[i.decision.level_source]];
}

function EventRow({ item }: { item: DecisionWithFeedback }) {
  const { decision } = item;
  const when = timeOf(item);
  const waiting = isOpen(item);
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="hidden w-24 shrink-0 pt-0.5 text-xs leading-5 text-muted-foreground tabular-nums sm:block">
        {dayLabel(when)}
        <br />
        {formatTime(when)}
      </span>
      <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-status-blocked" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
          {dayLabel(when)}, {formatTime(when)}
        </span>
        <EmailLink id={decision.id} className="group flex min-w-0 flex-col rounded-md outline-offset-2">
          <span className="font-medium group-hover:underline group-hover:underline-offset-4">{whatOscarDid(decision, item.done)}</span>
          <span className="truncate text-sm text-muted-foreground">
            {decision.subject || "(no subject)"} · {nameOf(decision.sender)}
          </span>
        </EmailLink>
        <ul className="flex flex-wrap gap-1.5" aria-label="Why">
          {reasonsOf(item).map((r) => (
            <li key={r} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {r}
            </li>
          ))}
          {waiting && <li className="rounded-full bg-status-needs/10 px-2 py-0.5 text-xs font-medium text-status-needs">Waiting on you</li>}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => openWhy(decision.id)}
        aria-label={`Why Oscar stopped "${decision.subject || "this email"}"`}
        className="-my-1 flex min-h-11 shrink-0 items-start rounded-full px-3 pt-2.5 text-sm font-medium text-primary hover:bg-surface-hover"
      >
        Why
      </button>
    </li>
  );
}

/** The emails a safety rule or check stopped, newest first, each linking to the email in All email. */
export function SafetyEvents({ items, readOnly }: { items: DecisionWithFeedback[]; readOnly: boolean }) {
  const [all, setAll] = useState(false);
  const events = safetyEvents(items);
  const shown = all ? events : events.slice(0, SHOWN);
  return (
    <Panel title="Recent safety events" className="min-w-0">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {items.length === 0
            ? "No emails yet. Once some come in, anything risky shows up here."
            : `Nothing risky so far. I'm keeping watch on every email${readOnly ? " I read" : ""}.`}
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y">
            {shown.map((i) => (
              <EventRow key={i.decision.id} item={i} />
            ))}
          </ul>
          {events.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              aria-expanded={all}
              className="flex min-h-11 items-center self-start rounded-full px-3 text-sm font-medium text-primary hover:bg-surface-hover"
            >
              {all ? "Show fewer" : `Show all ${events.length.toLocaleString()}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
