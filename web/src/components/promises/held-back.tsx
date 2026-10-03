"use client";

import { useState } from "react";
import Link from "next/link";
import { InboxLink } from "@/components/inbox/inbox-link";
import { SenderAvatar, addressOf, displayName } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import type { DecisionWithFeedback } from "@/lib/api";
import { when } from "@/lib/counts";
import { openWhy } from "@/lib/drawers";
import { timeOf } from "@/lib/insights";
import { FLAGS, LEVEL_SOURCES } from "@/lib/labels";
import { dayLabel, formatTime } from "@/lib/time";
import { isOpen } from "@/lib/use-oscar";

const SHOWN = 4;

/**
 * Why he held it back, in his words: his message without the "I stopped this one." opener,
 * or the checks that matched when there's no message.
 */
function whyOf({ decision }: DecisionWithFeedback) {
  const said = decision.message.replace(/^I stopped this one\.\s*/, "").trim();
  if (said) return said;
  const flags = decision.safety_flags.map((f) => FLAGS[f] ?? f.toLowerCase().replace(/_/g, " "));
  return flags.length ? flags.join(", ") : LEVEL_SOURCES[decision.level_source];
}

function Row({ item }: { item: DecisionWithFeedback }) {
  const { decision } = item;
  const address = addressOf(decision.sender);
  const at = timeOf(item);
  return (
    <li className="flex items-center gap-1 border-t">
      <InboxLink
        id={decision.id}
        className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg py-3.5 outline-offset-2"
      >
        <SenderAvatar sender={decision.sender} size={36} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold group-hover:underline group-hover:underline-offset-4">
            {displayName(decision.sender)}
            {address && <span className="font-normal text-muted-foreground"> · {address}</span>}
          </span>
          <span className="text-[13px] leading-normal text-muted-foreground">{whyOf(item)}</span>
          {isOpen(item) && <StatusWords level="ESCALATE">Waiting on you</StatusWords>}
        </span>
        <time dateTime={at} title={`${dayLabel(at)}, ${formatTime(at)}`} className="shrink-0 self-start pt-0.5 text-[13px] text-muted-foreground">
          {when(at)}
        </time>
      </InboxLink>
      <button
        type="button"
        onClick={() => openWhy(decision.id)}
        aria-label={`Why Oscar held back "${decision.subject || "this email"}"`}
        className="flex min-h-11 shrink-0 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      >
        Why?
      </button>
    </li>
  );
}

/** The emails a promise stopped, newest first, each opening the email in Inbox. */
export function HeldBack({ events, total, readOnly }: { events: DecisionWithFeedback[]; total: number; readOnly: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? events : events.slice(0, SHOWN);
  return (
    <section aria-labelledby="held-back" className="flex flex-col">
      <h2 id="held-back" className="mb-1 text-lg font-bold">
        {readOnly ? "What I would have held back lately" : "What I held back lately"}
      </h2>
      {events.length === 0 ? (
        <p className="border-t py-3.5 text-[13px] leading-normal text-muted-foreground">
          {total === 0
            ? "No emails yet. Once some come in, anything risky shows up here."
            : `Nothing risky so far. I'm keeping watch on every email${readOnly ? " I read" : ""}.`}
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {shown.map((i) => (
              <Row key={i.decision.id} item={i} />
            ))}
          </ul>
          {events.length > SHOWN && (
            <div className="flex flex-wrap items-center gap-x-2 border-t pt-1">
              <button
                type="button"
                onClick={() => setAll(!all)}
                aria-expanded={all}
                className="-ml-3 flex min-h-11 items-center rounded-full px-3 text-[13px] font-medium hover:bg-surface-hover"
              >
                {all ? "Show fewer" : `Show all ${events.length.toLocaleString()}`}
              </button>
              <Link
                href="/inbox"
                className="flex min-h-11 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                See all in Inbox
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
