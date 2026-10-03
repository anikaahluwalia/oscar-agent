"use client";

import { useState } from "react";
import Link from "next/link";
import { Undo2Icon } from "lucide-react";
import { HoldButton } from "@/components/hold-button";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { reallyDone } from "@/lib/insights";
import { DOABLE, FEEDBACK, HOLD_TO_CONFIRM, wouldOnly } from "@/lib/labels";
import { isAnswered, type useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Feedback = ReturnType<typeof useOscar>["feedback"];

// The big pill buttons from the design: 56px tall, half the row each.
export const BIG = "h-14 flex-1 basis-0 gap-2.5 px-7 text-[17px] font-bold";

/** What Oscar is waiting on you for with this email, if anything: the same rules as the buttons below. */
export function controlsFor(item: DecisionWithFeedback) {
  const d = item.decision;
  const level = d.autonomy_level;
  const real = d.source === "gmail";
  const would = wouldOnly(d);
  const answered = isAnswered(item);
  const canUndo = real ? !!item.done && !item.done.undone_at : (level === "PROCEED_SILENTLY" || level === "PROCEED_AND_NOTIFY") && !item.feedback.some((f) => f.kind === "UNDO");
  const ask = !would && level === "ASK_FIRST" && !answered && (!real || DOABLE.has(d.action));
  const stop = !would && level === "ESCALATE" && !answered;
  const told = !would && level === "PROCEED_AND_NOTIFY" && !answered && reallyDone(item);
  return { ask, stop, told, canUndo, any: ask || stop || told || canUndo || item.feedback.length > 0 };
}

/**
 * Approve, decline, mark as reviewed, looks good, and undo: only the ones that would really do
 * something. On the real inbox that means Oscar acts in Gmail and it's something he can do there
 * (mark as read, archive, label); otherwise grading is how you answer. `big` is the demo inbox,
 * where these are the main answer; on the real inbox they sit under the grading, smaller.
 */
export function DecisionControls({
  item,
  canAct,
  feedback,
  big = false,
  undoOnly = false,
  onAnswered,
}: {
  item: DecisionWithFeedback;
  canAct: boolean;
  feedback: Feedback;
  big?: boolean;
  /** Only the Undo button, for the real inbox where grading is the answer. */
  undoOnly?: boolean;
  /** Called after an answer went through, to move on to the next email. */
  onAnswered?: (kind: FeedbackKind) => void;
}) {
  const [busy, setBusy] = useState(false);
  const d = item.decision;
  const real = d.source === "gmail";
  const all = controlsFor(item);
  const { canUndo } = all;
  const [ask, stop, told] = undoOnly ? [false, false, false] : [all.ask, all.stop, all.told];
  const any = undoOnly ? canUndo : all.any;
  const needsActing = ask && real && !canAct;
  const hold = !real ? HOLD_TO_CONFIRM[d.action] : undefined;
  const size = big ? BIG : "h-11 px-5 text-sm";

  async function give(kind: FeedbackKind) {
    if (busy) return;
    setBusy(true);
    const ok = await feedback(d.id, kind);
    setBusy(false);
    if (ok) onAnswered?.(kind);
  }

  if (!any) return null;
  const youSaid = item.feedback;

  return (
    <div className="flex flex-col gap-3">
      {!undoOnly && youSaid.length > 0 && <p className="text-sm text-muted-foreground">You: {youSaid.map((f) => FEEDBACK[f.kind]).join(", ")}</p>}

      {needsActing && (
        <p className="rounded-xl bg-muted px-3.5 py-3 text-sm">
          I can do this in Gmail once acting is on.{" "}
          <Link href="/settings" className="font-semibold underline underline-offset-4">
            Turn it on in Settings
          </Link>
        </p>
      )}

      {ask && !needsActing && (
        <>
          {hold && <p className="text-sm text-muted-foreground">{hold}, so press and hold to approve.</p>}
          <div className="flex flex-wrap gap-3">
            {hold ? (
              <span className={cn("flex", big ? "flex-1 basis-0 [&>button]:h-14 [&>button]:w-full [&>button]:text-[17px] [&>button]:font-bold" : "")}>
                <HoldButton size="lg" disabled={busy} onConfirm={() => give("APPROVE")}>
                  Hold to approve
                </HoldButton>
              </span>
            ) : (
              <Button className={size} disabled={busy} onClick={() => give("APPROVE")}>
                Approve
              </Button>
            )}
            <Button variant="outline" className={cn(size, big && "bg-card")} disabled={busy} onClick={() => give("REJECT")}>
              Decline
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {real ? "Approving does it in Gmail now, and you can undo it." : "Your answer teaches me about this sender."}
          </p>
        </>
      )}

      {stop && (
        <div className="flex">
          <Button variant={big ? "default" : "outline"} className={size} disabled={busy} onClick={() => give("SEEN")}>
            Mark as reviewed
          </Button>
        </div>
      )}

      {(told || canUndo) && (
        <div className="flex flex-wrap gap-3">
          {told && (
            <Button className={size} disabled={busy} onClick={() => give("APPROVE")}>
              Looks good
            </Button>
          )}
          {canUndo && (
            <Button variant="outline" className={cn(size, big && "bg-card")} disabled={busy} onClick={() => give("UNDO")}>
              <Undo2Icon /> Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
