"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, EyeIcon, HelpCircleIcon, ShieldIcon } from "lucide-react";
import { InboxLink } from "@/components/inbox/inbox-link";
import { addressOf } from "@/components/kit/sender";
import { Button } from "@/components/ui/button";
import { didLine } from "@/lib/counts";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { ACTIONS, DOABLE, HOLD_TO_CONFIRM, wouldOnly } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SHOWN = 4;
const SMALL = "h-9 rounded-full px-4 text-[13px] font-semibold";

/** One thing waiting on you: what it is, Oscar's note, and the one or two things you can do right here. */
function NeedsRow({ item, canAct, onFeedback }: { item: DecisionWithFeedback; canAct: boolean; onFeedback: (kind: FeedbackKind) => Promise<boolean> }) {
  const { decision } = item;
  const [busy, setBusy] = useState(false);
  const check = wouldOnly(decision); // while he only reads: his call, for you to check
  const stopped = !check && decision.autonomy_level === "ESCALATE";
  // Approve right here when it's something he can just do; hard-to-undo ones open the email.
  const real = decision.source === "gmail";
  const quick = !check && !stopped && !HOLD_TO_CONFIRM[decision.action] && (!real || (canAct && DOABLE.has(decision.action)));
  const note = check ? `${didLine(item)}. Was that the right call?` : decision.message || didLine(item);
  const Icon = stopped ? ShieldIcon : check ? EyeIcon : HelpCircleIcon;

  async function give(kind: FeedbackKind) {
    setBusy(true);
    await onFeedback(kind);
    setBusy(false);
  }

  return (
    <li className="flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-1 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            stopped ? "bg-status-blocked/12 text-status-blocked" : "bg-status-needs/12 text-status-needs",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <InboxLink id={decision.id} className="truncate text-[15px] font-semibold underline-offset-4 hover:underline">
            {decision.subject || "(no subject)"}
          </InboxLink>
          <p className="text-sm leading-snug text-muted-foreground">{note}</p>
          <p className="truncate text-xs text-muted-foreground">{addressOf(decision.sender) || decision.sender}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-[54px] sm:pl-0">
        {stopped ? (
          <>
            <Button variant="outline" className={SMALL} onClick={() => openWhy(decision.id)}>
              See why
            </Button>
            <Button variant="ghost" className={cn(SMALL, "text-muted-foreground")} disabled={busy || (real && !canAct)} onClick={() => give("SEEN")}>
              Got it
            </Button>
          </>
        ) : check ? (
          <Button asChild variant="outline" className={SMALL}>
            <Link href={`/review#${decision.id}`}>Check this call</Link>
          </Button>
        ) : quick ? (
          <>
            <Button className={SMALL} disabled={busy} onClick={() => give("APPROVE")}>
              {ACTIONS[decision.action]}
            </Button>
            <Button asChild variant="outline" className={SMALL}>
              <InboxLink id={decision.id}>Review</InboxLink>
            </Button>
          </>
        ) : (
          <Button asChild variant="outline" className={SMALL}>
            <InboxLink id={decision.id}>Review</InboxLink>
          </Button>
        )}
      </div>
    </li>
  );
}

/** What's waiting on you, most urgent first. Only shown when something is. */
export function NeedsYou({
  items,
  canAct,
  onFeedback,
}: {
  items: DecisionWithFeedback[];
  canAct: boolean;
  onFeedback: (id: string, kind: FeedbackKind) => Promise<boolean>;
}) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="needs-you" className="flex flex-col rounded-[24px] border bg-card px-5 py-5 sm:px-6">
      <div className="mb-2 flex min-h-11 items-center justify-between">
        <h2 id="needs-you" className="text-lg font-bold">
          Needs you
        </h2>
        <span className="grid min-w-7 place-items-center rounded-full bg-status-needs/12 px-2 py-0.5 text-[13px] font-bold text-status-needs tabular-nums">
          {items.length.toLocaleString()}
        </span>
      </div>
      <ul className="flex flex-col">
        {items.slice(0, SHOWN).map((item) => (
          <NeedsRow key={item.decision.id} item={item} canAct={canAct} onFeedback={(kind) => onFeedback(item.decision.id, kind)} />
        ))}
      </ul>
      {items.length > SHOWN && (
        <Link href="/review" className="mt-1 flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-status-fyi underline-offset-4 hover:underline">
          See all {items.length.toLocaleString()} <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      )}
    </section>
  );
}
