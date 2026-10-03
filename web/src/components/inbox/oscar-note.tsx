"use client";

import { useState } from "react";
import { DecisionFacts } from "@/components/inbox/decision-facts";
import { DraftBox } from "@/components/kit/draft-box";
import { becauseOf, didIt, noteLine, outcomeOf, when } from "@/components/inbox/outcome";
import { HoldButton } from "@/components/hold-button";
import { LIKE_THIS, LikeThis, offersLikeThis } from "@/components/kit/like-this";
import { OscarAvatar } from "@/components/oscar-avatar";
import { OscarMood, type OscarPose } from "@/components/oscar-mood";
import { ReviewPanel } from "@/components/review-panel";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { DOABLE, FEEDBACK, HOLD_TO_CONFIRM, isSafetyStop, REPLIES, REVIEW_LABELS, toGrade, wouldOnly } from "@/lib/labels";
import { isAnswered, isOpen } from "@/lib/use-oscar";

type Props = {
  item: DecisionWithFeedback;
  onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean>;
  /** False for an earlier decision, which the Why drawer doesn't know about. */
  canExplain: boolean;
};

const TAP = "min-h-11 rounded-full px-4 text-sm font-semibold sm:min-h-10";

/**
 * His pose, from what really happened: done when he did it, guarding when he held it back,
 * asking while he waits on you, thinking while a read-only call waits for your grade.
 * Otherwise just his small face.
 */
function poseOf(item: DecisionWithFeedback): OscarPose | null {
  const { decision: d, done, feedback } = item;
  if (d.autonomy_level === "ESCALATE") return isSafetyStop(d) ? "guarding" : "asking";
  if (isOpen(item)) return "asking";
  if (wouldOnly(d)) return toGrade(item) ? "thinking" : null;
  if (didIt(d, done, feedback) || (d.source === "gmail" && done && !done.undone_at)) return "done";
  return null;
}

/**
 * Oscar's note on one email: what he did (or would do) and why, with what you can do about it.
 * The buttons are the ones the backend accepts (oscar/feedback.py check_allowed):
 * - read-only or not something he does in Gmail: grade it (ReviewPanel), nothing to approve or undo
 * - stopped: mark it as reviewed
 * - asked: approve or decline; on Gmail, approving does it there
 * - told you: "Looks good"
 * - done: undo, only when he really did it (Gmail's record, or the demo)
 * There's no "edit and send": Oscar never sends. A reply he writes waits in Gmail Drafts (DraftBox).
 */
export function OscarNote({ item, onFeedback, canExplain }: Props) {
  const { decision: d, feedback, review } = item;
  const [busy, setBusy] = useState(false);
  const real = d.source === "gmail";
  const level = d.autonomy_level;
  const would = wouldOnly(d);
  const answered = isAnswered(item);
  const reply = REPLIES.has(d.action);
  // Hold-to-approve, for what's hard to undo. Replies never go out, so they don't need it.
  const hold = !reply ? HOLD_TO_CONFIRM[d.action] : undefined;
  const pose = poseOf(item);
  const outcome = outcomeOf(item);
  // After you say the action was right, how much should he ask next time? Asked once.
  const saidRight = feedback.some((f) => f.kind === "APPROVE") || review?.label === "CORRECT";
  const saidHowMuch = feedback.some((f) => LIKE_THIS.some((c) => c.kind === f.kind) || f.kind === "ALWAYS_DO_THIS" || f.kind === "ALWAYS_ASK_ME");
  const askHowMuch = saidRight && !saidHowMuch && offersLikeThis(d);

  async function give(kind: FeedbackKind) {
    setBusy(true);
    await onFeedback(kind);
    setBusy(false);
  }

  const buttons: React.ReactNode[] = [];
  const notes: string[] = [];

  if (would) {
    notes.push(
      d.acting
        ? "This isn't something I do in Gmail, so there's nothing to approve or undo. You can tell me if I got it right."
        : "I was only reading your inbox, so there's nothing to approve or undo. You can tell me if I got it right.",
    );
  } else {
    if (didIt(d, item.done, feedback)) {
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
      if (real) notes.push("Approving does it in Gmail. You can undo it after.");
      else if (d.action === "DRAFT_REPLY") notes.push("Approving writes a draft reply in your Gmail. Nothing is sent.");
      else if (reply) notes.push("I never send emails. Approving tells me asking was right; the reply is yours.");
      else if (hold) notes.push("Press and hold to approve.");
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
    if (!buttons.length) notes.push(answered ? "You've answered this one. Nothing else to do." : "Nothing to do here.");
  }

  // What came of it, with times, and your answers so far. A read-only note or an open ask
  // already says nothing has changed.
  const history = [
    // Not something he does at all (a reply, an invite): the bold line already says nothing happened.
    ...(would || outcome.tone === "waiting" || (outcome.tone === "nothing" && !DOABLE.has(d.action)) ? [] : [outcome.text]),
    ...feedback.map((f) => `You: ${FEEDBACK[f.kind]}, ${when(f.created_at)}.`),
    ...(review && review.label !== "SKIP" ? [`You graded it: ${REVIEW_LABELS[review.label].label}, ${when(review.reviewed_at)}.`] : []),
  ];

  return (
    <section aria-label="Oscar's note" className="flex flex-col gap-4 rounded-[22px] border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {pose ? <OscarMood pose={pose} size={84} className="-my-1" /> : <OscarAvatar size={44} className="mx-2" />}
        <div className="flex min-w-[13.75rem] flex-1 flex-col gap-1 pt-1">
          <h2 className="text-[19px] leading-snug font-bold tracking-[-0.01em]">{noteLine(item)}</h2>
          <p className="text-[15px] leading-snug text-muted-foreground">{becauseOf(d)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {buttons}
          {canExplain && (
            <Button variant="outline" className={TAP} onClick={() => openWhy(d.id)}>
              Why?
            </Button>
          )}
        </div>
      </div>
      <DraftBox item={item} />
      <DecisionFacts decision={d} className="border-t pt-4" />
      {(notes.length > 0 || history.length > 0) && (
        <div className="flex flex-col gap-1 border-t pt-3 text-[13px] text-muted-foreground">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
          {history.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      )}
      {askHowMuch && (
        <div className="border-t pt-3">
          <LikeThis busy={busy} onChoose={(kind) => void give(kind)} />
        </div>
      )}
      {would && <ReviewPanel item={item} />}
    </section>
  );
}
