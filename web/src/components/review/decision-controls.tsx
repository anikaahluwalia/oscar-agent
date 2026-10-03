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

type Feedback = ReturnType<typeof useOscar>["feedback"];

// Big enough to tap on a phone.
const TAP = "h-11 px-5 text-sm";

/**
 * Approve, decline, mark as reviewed, looks good, and undo: only the ones that would really do
 * something. On the real inbox that means Oscar acts in Gmail and it's something he can do there
 * (mark as read, archive, label); otherwise grading is how you answer.
 */
export function DecisionControls({ item, canAct, feedback }: { item: DecisionWithFeedback; canAct: boolean; feedback: Feedback }) {
  const [busy, setBusy] = useState(false);
  const d = item.decision;
  const level = d.autonomy_level;
  const real = d.source === "gmail";
  const would = wouldOnly(d);
  const answered = isAnswered(item);

  async function give(kind: FeedbackKind) {
    if (busy) return;
    setBusy(true);
    await feedback(d.id, kind);
    setBusy(false);
  }

  const canUndo = real ? !!item.done && !item.done.undone_at : (level === "PROCEED_SILENTLY" || level === "PROCEED_AND_NOTIFY") && !item.feedback.some((f) => f.kind === "UNDO");
  const ask = !would && level === "ASK_FIRST" && !answered && (!real || DOABLE.has(d.action));
  const needsActing = ask && real && !canAct;
  const stop = !would && level === "ESCALATE" && !answered;
  const told = !would && level === "PROCEED_AND_NOTIFY" && !answered && reallyDone(item);
  const hold = !real ? HOLD_TO_CONFIRM[d.action] : undefined;

  const youSaid = item.feedback;
  if (!ask && !stop && !told && !canUndo && !youSaid.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {youSaid.length > 0 && (
        <p className="text-sm text-muted-foreground">You: {youSaid.map((f) => FEEDBACK[f.kind]).join(", ")}</p>
      )}

      {needsActing && (
        <p className="rounded-xl bg-muted px-3.5 py-3 text-sm">
          Oscar can do this in Gmail once acting is on.{" "}
          <Link href="/settings" className="font-medium text-primary underline-offset-4 hover:underline">
            Turn it on in Settings
          </Link>
        </p>
      )}

      {ask && !needsActing && (
        <>
          {hold && <p className="text-sm text-muted-foreground">{hold}, so press and hold to approve.</p>}
          <div className="grid grid-cols-2 gap-2">
            {hold ? (
              <HoldButton size="lg" disabled={busy} onConfirm={() => give("APPROVE")}>
                Hold to approve
              </HoldButton>
            ) : (
              <Button className={TAP} disabled={busy} onClick={() => give("APPROVE")}>
                Approve
              </Button>
            )}
            <Button variant="outline" className={TAP} disabled={busy} onClick={() => give("REJECT")}>
              Decline
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {real ? "Approving does it in Gmail now, and you can undo it." : "Your answer teaches him about this sender."}
          </p>
        </>
      )}

      {stop && (
        <Button variant="outline" className={TAP} disabled={busy} onClick={() => give("SEEN")}>
          Mark as reviewed
        </Button>
      )}

      {(told || canUndo) && (
        <div className="flex flex-wrap gap-2">
          {told && (
            <Button className={TAP} disabled={busy} onClick={() => give("APPROVE")}>
              Looks good
            </Button>
          )}
          {canUndo && (
            <Button variant="outline" className={TAP} disabled={busy} onClick={() => give("UNDO")}>
              <Undo2Icon /> Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
