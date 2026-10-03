"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCheckIcon, HandIcon, ShieldAlertIcon } from "lucide-react";
import { EmailLink } from "@/components/email-link";
import { HoldButton } from "@/components/hold-button";
import { SenderAvatar } from "@/components/review/sender-avatar";
import { Button } from "@/components/ui/button";
import { didLine, senderName, when } from "@/components/home/counts";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { timeOf } from "@/lib/insights";
import { FLAGS, HOLD_TO_CONFIRM, LEVEL_SOURCES, STATUS, wouldOnly } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Props = {
  item: DecisionWithFeedback;
  index: number;
  total: number;
  onFeedback: (kind: FeedbackKind) => Promise<boolean>;
};

/** Oscar's reasons, from his working notes: what he noticed and which rule he checked. */
function reasonsFor(item: DecisionWithFeedback): string[] {
  const { steps, level_source } = item.decision;
  // The first note is "Read the email from ..." and the last is what he decided.
  // Safety flags show as their own chips, so the fallback is which rule he went by.
  const middle = steps.length > 2 ? steps.slice(1, -1) : [];
  const reasons = middle.length ? middle : [LEVEL_SOURCES[level_source]].filter(Boolean);
  return reasons.slice(0, 3);
}

/** One email that needs you, as a card: what Oscar wants to do, why, and your buttons. */
export function NeedsCard({ item, index, total, onFeedback }: Props) {
  const { decision } = item;
  const [busy, setBusy] = useState(false);
  const check = wouldOnly(decision); // read-only: his call, for you to check
  const stopped = !check && decision.autonomy_level === "ESCALATE";
  const reasons = reasonsFor(item);
  const hold = HOLD_TO_CONFIRM[decision.action];

  async function give(kind: FeedbackKind) {
    setBusy(true);
    await onFeedback(kind);
    setBusy(false);
  }

  const strip = check
    ? { label: "Check my call", icon: ClipboardCheckIcon, tone: STATUS[decision.autonomy_level].pill }
    : stopped
      ? { label: "Stopped", icon: ShieldAlertIcon, tone: "bg-status-blocked/10 text-status-blocked" }
      : { label: "Needs your okay", icon: HandIcon, tone: "bg-status-needs/10 text-status-needs" };
  const Icon = strip.icon;

  return (
    <article
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-card",
        stopped && "border-status-blocked/25",
      )}
    >
      <div className={cn("flex items-center justify-between gap-3 px-5 py-2.5 text-xs font-semibold tracking-wide uppercase", strip.tone)}>
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5" aria-hidden />
          {strip.label}
        </span>
        <span className="font-medium tabular-nums normal-case">
          {index + 1} of {total.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <SenderAvatar sender={decision.sender} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold">{senderName(decision.sender)}</p>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(timeOf(item))}</span>
            </div>
            <EmailLink id={decision.id} className="block truncate text-sm text-muted-foreground hover:text-foreground hover:underline">
              {decision.subject || "(no subject)"}
            </EmailLink>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {decision.safety_flags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="What his safety checks found">
              {decision.safety_flags.slice(0, 2).map((f) => (
                <li key={f} className="rounded-full bg-status-blocked/10 px-2.5 py-0.5 text-xs font-medium text-status-blocked">
                  {FLAGS[f] ?? f.replace(/_/g, " ").toLowerCase()}
                </li>
              ))}
            </ul>
          )}
          <p className={cn("font-semibold", stopped && "text-status-blocked")}>{didLine(item)}</p>
          {stopped && <p className="text-sm text-muted-foreground">I didn&apos;t do anything with it.</p>}
          {reasons.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span
                    className={cn("mt-2 size-1.5 shrink-0 rounded-full", stopped ? "bg-status-blocked" : check ? STATUS[decision.autonomy_level].dot : "bg-status-needs")}
                    aria-hidden
                  />
                  <span className="min-w-0">{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hold && !check && !stopped && <p className="mt-auto text-xs text-muted-foreground">{hold}, so press and hold to approve.</p>}
        <div className={cn("flex flex-wrap items-center gap-2", !(hold && !check && !stopped) && "mt-auto")}>
          {check ? (
            <Button asChild className="h-11 px-5 sm:h-10">
              <Link href={`/review#${decision.id}`}>Check this call</Link>
            </Button>
          ) : stopped ? (
            <Button asChild variant="outline" className="h-11 px-5 sm:h-10">
              <Link href={`/inbox#${decision.id}`}>View details</Link>
            </Button>
          ) : (
            <>
              {hold ? (
                <HoldButton size="lg" disabled={busy} onConfirm={() => give("APPROVE")}>
                  Hold to approve
                </HoldButton>
              ) : (
                <Button className="h-11 px-5 sm:h-10" disabled={busy} onClick={() => give("APPROVE")}>
                  Approve
                </Button>
              )}
              <Button variant="outline" className="h-11 px-5 sm:h-10" disabled={busy} onClick={() => give("REJECT")}>
                Decline
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="ml-auto h-11 px-3 text-muted-foreground sm:h-10"
            onClick={() => openWhy(decision.id)}
            aria-label={`Why? ${decision.subject || "This email"}`}
          >
            Why?
          </Button>
        </div>
      </div>
    </article>
  );
}
