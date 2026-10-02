"use client";

import { useState } from "react";
import Link from "next/link";
import { EmailLink } from "@/components/email-link";
import { ShieldIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HoldButton } from "@/components/hold-button";
import { OscarAvatar } from "@/components/oscar-avatar";
import { ReviewPanel } from "@/components/review-panel";
import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { ACTIONS, FEEDBACK, FLAGS, HOLD_TO_CONFIRM, REPLIES, whatOscarDid } from "@/lib/labels";
import { formatTime } from "@/lib/time";
import { isAnswered } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Props = {
  item: DecisionWithFeedback;
  onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean>;
  /** On the Needs You page each card shows who it's from and links to the email. */
  compact?: boolean;
};

function Why({ id }: { id: string }) {
  return (
    <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => openWhy(id)}>
      Why?
    </Button>
  );
}

/** What Oscar did or wants to do with one email, and what you can do about it. */
export function DecisionCard({ item, onFeedback, compact }: Props) {
  const { decision, feedback } = item;
  const level = decision.autonomy_level;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const answered = isAnswered(item);
  const hold = HOLD_TO_CONFIRM[decision.action];
  const reply = REPLIES.has(decision.action);

  async function give(kind: FeedbackKind, edited?: string) {
    setBusy(true);
    const ok = await onFeedback(kind, edited);
    setBusy(false);
    if (ok) setEditing(false);
  }

  const youSaid = feedback.length > 0 && (
    <p className="text-sm text-muted-foreground">You: {feedback.map((f) => FEEDBACK[f.kind]).join(", ")}</p>
  );
  const from = compact && (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{decision.sender}</p>
        <EmailLink id={decision.id} className="block truncate font-medium hover:underline">
          {decision.subject}
        </EmailLink>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(decision.created_at)}</span>
    </div>
  );

  // The real inbox is read-only for now: show what Oscar would have done, and let you review it.
  if (decision.source === "gmail") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card shadow-card p-5">
        {from}
        <div className="flex items-center gap-3">
          <OscarAvatar size={32} mood={level === "ESCALATE" ? "alert" : level === "ASK_FIRST" ? "curious" : "calm"} />
          <div className="min-w-0">
            <p className="font-medium">{whatOscarDid(decision)}</p>
            <p className="text-xs text-muted-foreground">Read-only: nothing was changed in Gmail.</p>
          </div>
          <StatusPill level={level} readOnly className="ml-auto" />
        </div>
        <p className="text-sm text-muted-foreground">{decision.message}</p>
        {decision.safety_flags.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {decision.safety_flags.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-status-blocked" aria-hidden />
                {FLAGS[f] ?? f}
              </li>
            ))}
          </ul>
        )}
        <ReviewPanel item={item} />
        <div className="flex">
          <Why id={decision.id} />
        </div>
      </div>
    );
  }

  if (level === "ESCALATE") {
    const reasons = decision.safety_flags.length
      ? decision.safety_flags.map((f) => FLAGS[f] ?? f)
      : decision.steps.slice(-2, -1); // the protected rule that applied
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-status-blocked/25 bg-card p-5">
        {from}
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-status-blocked/10 text-status-blocked">
            <ShieldIcon className="size-4" />
          </span>
          <div>
            <p className="font-medium">Oscar stopped this</p>
            <p className="text-sm text-muted-foreground">No action was taken.</p>
          </div>
          {!compact && <OscarAvatar size={36} mood="alert" className="ml-auto" />}
        </div>
        <p className="text-sm">{decision.message}</p>
        {reasons.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-status-blocked" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        )}
        {youSaid}
        <div className="flex flex-wrap items-center gap-2">
          {compact && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/email#${decision.id}`}>Review email</Link>
            </Button>
          )}
          {!answered && (
            <Button size="sm" variant={compact ? "ghost" : "outline"} disabled={busy} onClick={() => give("SEEN")}>
              Mark as reviewed
            </Button>
          )}
          <Why id={decision.id} />
        </div>
      </div>
    );
  }

  if (level === "ASK_FIRST") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card shadow-card p-5">
        {from}
        {!compact && (
          <div className="flex items-center gap-3">
            <OscarAvatar size={32} mood="curious" />
            <p className="font-medium">Oscar thinks this needs you.</p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Suggested action</p>
          <p className="font-medium">{ACTIONS[decision.action]}</p>
        </div>
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">{decision.message}</p>
        {hold && !answered && <p className="text-sm text-muted-foreground">{hold}, so press and hold to approve.</p>}
        {editing && (
          <div className="flex flex-col gap-2">
            <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the reply you want to send" />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !text.trim()} onClick={() => give("EDIT_THEN_SEND", text)}>
                Send
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {youSaid}
        <div className="flex flex-wrap items-center gap-2">
          {!answered && !editing && (
            <>
              {hold ? (
                <HoldButton disabled={busy} onConfirm={() => give("APPROVE")}>
                  {reply ? "Hold to send" : "Hold to approve"}
                </HoldButton>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => give("APPROVE")}>
                  {reply ? "Approve & send" : "Approve"}
                </Button>
              )}
              {reply && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => give("REJECT")}>
                {reply ? "Don't send" : "Decline"}
              </Button>
            </>
          )}
          <Why id={decision.id} />
        </div>
      </div>
    );
  }

  // Handled and FYI: Oscar already did it, so keep it quiet. You can check it or undo it.
  const undone = feedback.some((f) => f.kind === "UNDO");
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border bg-card shadow-card p-5", level === "PROCEED_SILENTLY" && "bg-card/60")}>
      {from}
      <p className="font-medium">
        {undone ? "Undone. It's back the way it was." : `Oscar: ${whatOscarDid(decision).toLowerCase()}.`}
      </p>
      <p className="text-sm text-muted-foreground">{decision.message}</p>
      {youSaid}
      <div className="flex flex-wrap items-center gap-2">
        {!answered && level === "PROCEED_AND_NOTIFY" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => give("APPROVE")}>
            Looks good
          </Button>
        )}
        {!undone && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => give("UNDO")}>
            Undo
          </Button>
        )}
        <Why id={decision.id} />
      </div>
    </div>
  );
}
