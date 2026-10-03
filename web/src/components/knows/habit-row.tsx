"use client";

import { useEffect, useRef, useState } from "react";
import { displayName, SenderAvatar } from "@/components/kit/sender";
import type { MemoryItem } from "@/components/memory/facts";
import { Button } from "@/components/ui/button";
import type { FeedbackKind } from "@/lib/api";
import { AROUND, evidenceLine } from "./facts";

const mini = "h-11 rounded-full px-3 text-[13px] font-semibold sm:h-9";

/** "I mark emails from Substack as read without asking.", with the sender's name in bold. */
function Habit({ item, would }: { item: MemoryItem; would: boolean }) {
  const { learned, level } = item;
  const [before, after] = AROUND[learned.action];
  const who = <b className="font-semibold">{displayName(learned.sender)}</b>;
  const what = (
    <>
      {before}
      {who}
      {after}
    </>
  );
  const I = would ? "I'd" : "I";
  if (level === "ESCALATE") return <>Emails from {who} always come to you.</>;
  if (level === "PROCEED_SILENTLY") return <>{I} {what} without asking.</>;
  if (level === "PROCEED_AND_NOTIFY") return <>{I} {what} and tell you.</>;
  if (level === "ASK_FIRST")
    return (
      <>
        {would ? "I'd" : "I"} {learned.always_ask ? "always ask" : "ask"} before I {what}.
      </>
    );
  return <>I&apos;m still learning whether to {what}.</>;
}

type Props = {
  item: MemoryItem;
  would: boolean; // real inbox: only what he would do, unless he really can do it
  outsideGmail: boolean; // real inbox, and an action he never does there
  started: string | null; // "started 2 weeks ago"
  onFeedback: (decisionId: string, kind: FeedbackKind) => Promise<unknown>;
};

/** One thing Oscar learned about a sender: what he does now, what taught him, and Always ask / Forget. */
export function HabitRow({ item, would, outsideGmail, started, onFeedback }: Props) {
  const { learned, limits, taught, decisionId, level } = item;
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const name = displayName(learned.sender);

  useEffect(() => {
    if (confirmForget) keep.current?.focus();
  }, [confirmForget]);

  const send = async (kind: FeedbackKind) => {
    if (!decisionId || busy) return;
    setBusy(true);
    await onFeedback(decisionId, kind);
    setBusy(false);
    setConfirmForget(false);
  };

  const evidence = evidenceLine(taught);
  const stillLearning = learned.level === null && !learned.always_ask;
  const lock =
    limits?.floor === "ASK_FIRST" && level !== "ESCALATE"
      ? `Always asks first: ${limits.floor_reason ?? "a protected rule"}`
      : limits?.ceiling === "PROCEED_AND_NOTIFY"
        ? "Never quietly: I always give you a heads up on these"
        : null;
  const facts = [
    learned.always_ask ? (evidence ? `You told me to always ask. Before that, ${evidence[0].toLowerCase()}${evidence.slice(1)}` : "You told me to") : (evidence ?? "No answers yet"),
    started,
    stillLearning && "not enough to go on yet",
    lock,
  ].filter(Boolean);
  const canAsk = !learned.always_ask && level !== "ESCALATE";

  return (
    <li className="flex gap-3.5 border-t py-4">
      <SenderAvatar sender={learned.sender} size={40} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[15px]" title={learned.sender}>
            <Habit item={item} would={would} />
          </p>
          <p className="text-[13px] text-muted-foreground">{facts.join(" · ")}</p>
          {outsideGmail && <p className="text-[13px] text-muted-foreground">I don&apos;t do this in Gmail, so it stays yours to do.</p>}
        </div>

        {!decisionId ? (
          <p className="text-[13px] text-muted-foreground sm:max-w-48">I need a recent email from this sender before you can change this here.</p>
        ) : confirmForget ? (
          <div role="group" aria-label={`Forget what I know about ${name}?`} className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]">Start fresh with this sender?</span>
            <Button variant="destructive" className={mini} disabled={busy} onClick={() => send("FORGET")}>
              Forget
            </Button>
            <Button ref={keep} variant="outline" className={mini} disabled={busy} onClick={() => setConfirmForget(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canAsk && (
              <Button variant="outline" className={mini} disabled={busy} aria-label={`Always ask, ${name}`} onClick={() => send("ALWAYS_ASK_ME")}>
                Always ask
              </Button>
            )}
            <Button variant="outline" className={mini} disabled={busy} aria-label={`Forget, ${name}`} onClick={() => setConfirmForget(true)}>
              Forget
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
