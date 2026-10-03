"use client";

import { useState } from "react";
import { didIt } from "@/components/activity/outcome";
import { HoldButton } from "@/components/hold-button";
import { ReviewPanel } from "@/components/review-panel";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { HOLD_TO_CONFIRM, REPLIES, wouldOnly } from "@/lib/labels";
import { isAnswered } from "@/lib/use-oscar";

type Props = {
  item: DecisionWithFeedback;
  onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean>;
};

const TAP = "min-h-11 px-4 sm:min-h-9";

/**
 * What you can do about one decision, as buttons only (the detail above already says what he did
 * and why). Each button is one the backend accepts (oscar/feedback.py check_allowed):
 * - read-only or not something he does in Gmail: grade it (ReviewPanel), nothing to approve or undo
 * - stopped: mark it as reviewed
 * - asked: approve or decline; on Gmail, approving does it there
 * - done: undo, only when he really did it (Gmail's record, or the demo)
 * There's no "edit and send": Oscar never writes or sends replies.
 */
export function DecisionActions({ item, onFeedback }: Props) {
  const { decision: d, done, feedback } = item;
  const [busy, setBusy] = useState(false);
  const real = d.source === "gmail";
  const level = d.autonomy_level;
  const answered = isAnswered(item);
  const reply = REPLIES.has(d.action);
  // Hold-to-approve, for what's hard to undo. Replies never go out, so they don't need it.
  const hold = !reply ? HOLD_TO_CONFIRM[d.action] : undefined;

  async function give(kind: FeedbackKind) {
    setBusy(true);
    await onFeedback(kind);
    setBusy(false);
  }

  if (wouldOnly(d)) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {d.acting
            ? "This isn't something he does in Gmail, so there's nothing to approve or undo. You can tell him if he got it right."
            : "He was only reading your inbox, so there's nothing to approve or undo. You can tell him if he got it right."}
        </p>
        <ReviewPanel item={item} />
      </div>
    );
  }

  const canUndo = didIt(d, done, feedback);
  const buttons: React.ReactNode[] = [];
  let note: string | null = null;

  if (canUndo) {
    buttons.push(
      <Button key="undo" variant="outline" className={TAP} disabled={busy} onClick={() => give("UNDO")}>
        Undo
      </Button>,
    );
  }

  if (level === "ESCALATE" && !answered) {
    buttons.push(
      <Button key="seen" variant="outline" className={TAP} disabled={busy} onClick={() => give("SEEN")}>
        Mark as reviewed
      </Button>,
    );
  }

  if (level === "ASK_FIRST" && !answered) {
    if (real) note = "Approving does it in Gmail. You can undo it after.";
    else if (reply) note = "Oscar doesn't write or send replies. Approving tells him asking was right; the reply is yours.";
    else if (hold) note = `${hold}, so press and hold to approve.`;
    buttons.push(
      hold ? (
        <HoldButton key="approve" size="lg" disabled={busy} onConfirm={() => give("APPROVE")}>
          Hold to approve
        </HoldButton>
      ) : (
        <Button key="approve" className={TAP} disabled={busy} onClick={() => give("APPROVE")}>
          Approve
        </Button>
      ),
      <Button key="decline" variant="outline" className={TAP} disabled={busy} onClick={() => give("REJECT")}>
        Decline
      </Button>,
    );
  }

  if (level === "PROCEED_AND_NOTIFY" && !answered) {
    buttons.push(
      <Button key="ok" variant="outline" className={TAP} disabled={busy} onClick={() => give("APPROVE")}>
        Looks good
      </Button>,
    );
  }

  if (!buttons.length) {
    return <p className="text-sm text-muted-foreground">{answered ? "You've answered this one. Nothing else to do." : "Nothing to do here."}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap items-center gap-2">{buttons}</div>
    </div>
  );
}
