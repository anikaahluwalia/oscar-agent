"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Highlight } from "@/components/highlight";
import { MOOD_FOR_LEVEL, OscarAvatar } from "@/components/oscar-avatar";
import type { DecisionWithFeedback, FeedbackKind, Level } from "@/lib/api";
import { ACTIONS, FEEDBACK, FLAGS, LEVEL_SOURCES, LEVELS } from "@/lib/labels";
import { isAnswered } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const REPLIES = new Set(["DRAFT_REPLY", "SEND_REPLY"]);
const MARK: Record<Level, string> = {
  PROCEED_SILENTLY: "bg-level-silent/30",
  PROCEED_AND_NOTIFY: "bg-level-notify/35",
  ASK_FIRST: "bg-level-ask/35",
  ESCALATE: "bg-level-escalate/35",
};

type Props = {
  item: DecisionWithFeedback;
  index?: number;
  onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean>;
};

export function EmailRow({ item, index = 0, onFeedback }: Props) {
  const { decision, feedback } = item;
  const level = decision.autonomy_level;
  const [open, setOpen] = useState(level === "ESCALATE");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = isAnswered(item);
  const canEdit = REPLIES.has(decision.action) && level !== "ESCALATE";

  async function give(kind: FeedbackKind, editedText?: string) {
    setBusy(true);
    const ok = await onFeedback(kind, editedText);
    setBusy(false);
    if (ok) setEditing(false);
  }

  // The main buttons stay visible on the closed row; the rest show when it's open.
  const main = !answered && level !== "ESCALATE" && (
    <div className="flex shrink-0 gap-1.5">
      {level === "ASK_FIRST" && (
        <>
          <Button size="sm" disabled={busy} onClick={() => give("APPROVE")}>Yes</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => give("REJECT")}>No</Button>
        </>
      )}
      {level === "PROCEED_AND_NOTIFY" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => give("APPROVE")}>Looks good</Button>
      )}
      {level !== "ASK_FIRST" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => give("UNDO")}>Undo</Button>
      )}
    </div>
  );

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: answered ? 0.55 : 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
      className="rounded-2xl border bg-card"
    >
      <div className="flex items-center gap-3 p-3 pl-4">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className={cn("size-2 shrink-0 rounded-[2px]", LEVELS[level].square)} aria-label={LEVELS[level].label} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-medium">{decision.subject}</span>
              <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">{decision.sender}</span>
            </span>
            {!open && <span className="block truncate text-sm text-muted-foreground">{decision.message}</span>}
          </span>
          <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {main}
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {/* Some phrases are in the subject (like "Invitation:"), so show it when that's where the match is. */}
            {decision.noticed && decision.subject.toLowerCase().includes(decision.noticed.toLowerCase()) && (
              <span className="mb-1 block font-medium text-foreground">
                <Highlight text={decision.subject} phrase={decision.noticed} className={MARK[level]} />
              </span>
            )}
            <Highlight text={decision.snippet} phrase={decision.noticed} className={MARK[level]} />
          </p>

          <div className="flex items-start gap-2">
            <OscarAvatar size={32} mood={MOOD_FOR_LEVEL[level]} />
            <p className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">{decision.message}</p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Proposed</dt>
            <dd>{ACTIONS[decision.action]}</dd>
            <dt className="text-muted-foreground">Why this level</dt>
            <dd>{LEVEL_SOURCES[decision.level_source]}</dd>
            {decision.safety_flags.length > 0 && (
              <>
                <dt className="text-muted-foreground">Safety checks</dt>
                <dd>{decision.safety_flags.map((f) => FLAGS[f] ?? f).join(", ")}</dd>
              </>
            )}
          </dl>

          {editing && (
            <div className="flex flex-col gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the reply you want to send" />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !text.trim()} onClick={() => give("EDIT_THEN_SEND", text)}>Send</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {feedback.length > 0 && (
              <p className="mr-auto text-xs text-muted-foreground">You said: {feedback.map((f) => FEEDBACK[f.kind]).join(", ")}</p>
            )}
            {level === "ESCALATE" ? (
              <p className="text-xs text-muted-foreground">I won&apos;t act on this one. It&apos;s yours.</p>
            ) : (
              <>
                {!answered && canEdit && !editing && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit and send</Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => give("ALWAYS_DO_THIS")}>Always do this</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => give("ALWAYS_ASK_ME")}>Always ask me</Button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.li>
  );
}
