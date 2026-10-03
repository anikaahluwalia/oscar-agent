"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { EmailLink } from "@/components/email-link";
import { HoldButton } from "@/components/hold-button";
import { EmailContent } from "@/components/kit/email-preview";
import { addressOf, displayName, SenderAvatar } from "@/components/kit/sender";
import { StatusWords } from "@/components/kit/status";
import { MOOD_FOR_LEVEL, OscarAvatar } from "@/components/oscar-avatar";
import { Button } from "@/components/ui/button";
import { didLine, when } from "@/lib/counts";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { timeOf } from "@/lib/insights";
import { ACTIONS, FLAGS, HOLD_TO_CONFIRM, wouldOnly } from "@/lib/labels";
import { previewOf } from "@/lib/text";
import { cn } from "@/lib/utils";
import { tagsFor, waitWords } from "@/components/today/words";
import { useWide } from "@/components/today/use-wide";

type Props = {
  item: DecisionWithFeedback;
  items: DecisionWithFeedback[]; // everything Oscar has read, for what he knows about the sender
  index: number;
  total: number;
  readOnly: boolean;
  onMove: (to: number) => void;
  onFeedback: (kind: FeedbackKind) => Promise<boolean>;
};

const BIG = "h-12 rounded-full px-6 text-[15px] font-semibold sm:text-base";

/** "1 of 3", with buttons to step through what's waiting. */
function Pager({ index, total, onMove }: Pick<Props, "index" | "total" | "onMove">) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <span className="text-[13px] text-muted-foreground tabular-nums" aria-live="polite">
        {(index + 1).toLocaleString()} of {total.toLocaleString()}
      </span>
      {total > 1 && (
        <>
          <Button variant="ghost" size="icon" className="size-11 sm:size-9" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="The one before">
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-11 sm:size-9" disabled={index === total - 1} onClick={() => onMove(index + 1)} aria-label="The next one">
            <ChevronRightIcon className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

/** The first thing waiting on you, one at a time: the email, then Oscar's note and your buttons. */
export function WaitingCard({ item, items, index, total, readOnly, onMove, onFeedback }: Props) {
  const { decision } = item;
  const wide = useWide();
  const [busy, setBusy] = useState(false);
  const check = wouldOnly(decision); // read-only: his call, for you to check
  const stopped = !check && decision.autonomy_level === "ESCALATE";
  const hold = !check && !stopped ? HOLD_TO_CONFIRM[decision.action] : undefined;
  const tags = tagsFor(item, items);
  // Safety flags in Oscar's note, unless a tag already says the same ("Asks for money").
  const flags = decision.safety_flags.map((f) => FLAGS[f] ?? f.replace(/_/g, " ").toLowerCase()).filter((f) => !tags.includes(f));
  const address = addressOf(decision.sender);
  const time = when(timeOf(item));
  const subject = decision.subject || "(no subject)";

  async function give(kind: FeedbackKind) {
    setBusy(true);
    await onFeedback(kind);
    setBusy(false);
  }

  // His words: what he'd ask you, what he stopped, or (while he only reads) what he would have done.
  const note = check ? `${didLine(item)}. Was that the right call?` : decision.message || didLine(item);
  const action = ACTIONS[decision.action];

  return (
    <div className="relative pb-3 sm:pb-0">
      {total > 1 && (
        <div aria-hidden className="absolute inset-x-3.5 bottom-0 h-8 rounded-[20px] border bg-card sm:hidden" />
      )}
      <article
        aria-label={readOnly ? "A call for you to check" : "What Oscar brought you"}
        className={cn("relative overflow-hidden rounded-3xl border bg-card shadow-card sm:rounded-[28px]", stopped && "border-status-blocked/30")}
      >
        <div className="flex flex-wrap items-center gap-2.5 px-4 pt-4 sm:gap-3 sm:px-6 sm:py-5">
          <SenderAvatar sender={decision.sender} size={wide ? 44 : 36} />
          <div className="min-w-0 flex-1 sm:min-w-[180px]">
            <div className="truncate text-[15px] font-bold sm:text-base">{displayName(decision.sender)}</div>
            <div className="flex text-xs whitespace-nowrap text-muted-foreground sm:text-[13px]">
              <span className="truncate">{wide ? address || time : time}</span>
              <span className="shrink-0">{wide ? address && `\u00a0· ${time}` : tags[0] && `\u00a0· ${tags[0]}`}</span>
            </div>
          </div>
          {wide && tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="About this email">
              {tags.map((t) => (
                <li key={t} className="inline-flex min-h-7 items-center rounded-full bg-muted px-2.5 text-[13px] font-semibold text-muted-foreground">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        {wide ? (
          <div className="mx-6 overflow-hidden rounded-2xl border" aria-label="The email, as Gmail shows it">
            <h2 className="border-b px-5 py-3.5 text-[22px] leading-tight font-bold tracking-[-0.015em] text-pretty">{subject}</h2>
            <div className="p-3">
              <EmailContent decision={decision} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-4 pt-2.5">
            <h2 className="text-[17px] leading-snug font-bold text-pretty">{subject}</h2>
            {previewOf(decision) && (
              <p className="rounded-xl bg-muted/70 px-3 py-2.5 text-[13px] leading-normal text-muted-foreground">
                <span className="line-clamp-3">{previewOf(decision)}</span>
              </p>
            )}
          </div>
        )}
        <EmailLink id={decision.id} className="mx-4 mt-1 inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline sm:mx-6 sm:mt-2">
          Open the whole email
        </EmailLink>

        <div className="mt-1 flex items-start gap-3 border-t bg-muted/40 px-4 py-4 sm:mt-3 sm:px-6 sm:py-[18px]">
          <OscarAvatar size={36} mood={MOOD_FOR_LEVEL[decision.autonomy_level]} className="hidden sm:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {flags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="What his safety checks found">
                {flags.slice(0, 2).map((f) => (
                  <li key={f} className="rounded-full bg-status-blocked/10 px-2.5 py-0.5 text-xs font-medium text-status-blocked">
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm leading-relaxed sm:text-base">
              <StatusWords level={decision.autonomy_level} className="mr-1.5 align-[1px] text-xs sm:text-[13px]">
                {waitWords(item, readOnly)}
              </StatusWords>
              {note}
            </p>
            {hold && <p className="text-xs text-muted-foreground">{hold}, so press and hold.</p>}

            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                {check ? (
                  <Button asChild className={BIG}>
                    <Link href={`/review#${decision.id}`}>Check this call</Link>
                  </Button>
                ) : stopped ? (
                  <Button asChild variant="outline" className={BIG}>
                    <Link href={`/inbox#${decision.id}`}>View details</Link>
                  </Button>
                ) : (
                  <>
                    {hold ? (
                      <span className="flex [&_button]:h-12 [&_button]:w-full [&_button]:px-6 [&_button]:text-[15px] [&_button]:font-semibold sm:[&_button]:text-base">
                        <HoldButton size="lg" disabled={busy} onConfirm={() => give("APPROVE")}>
                          Hold to {action.toLowerCase()}
                        </HoldButton>
                      </span>
                    ) : (
                      <Button className={BIG} disabled={busy} onClick={() => give("APPROVE")}>
                        {action}
                      </Button>
                    )}
                    <Button variant="outline" className={cn(BIG, "bg-card")} disabled={busy} onClick={() => give("REJECT")}>
                      Not this one
                    </Button>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                className="h-11 rounded-full px-3 text-muted-foreground sm:h-10"
                onClick={() => openWhy(decision.id)}
                aria-label={`Why? ${decision.subject || "This email"}`}
              >
                Why?
              </Button>
              <Pager index={index} total={total} onMove={onMove} />
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
