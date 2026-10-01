"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Highlight } from "@/components/highlight";
import { HoldButton } from "@/components/hold-button";
import type { DecisionWithFeedback, FeedbackKind, Level } from "@/lib/api";
import { FEEDBACK, FLAGS, HOLD_TO_CONFIRM, LEVEL_SOURCES, LEVELS } from "@/lib/labels";
import { onShowEmail } from "@/lib/show-email";
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
  // Rows only render in the browser (after the inbox loads), so reading the hash here is safe.
  const [open, setOpen] = useState(() => window.location.hash === `#${decision.id}`);
  const row = useRef<HTMLLIElement>(null);
  const [why, setWhy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = isAnswered(item);
  const canEdit = REPLIES.has(decision.action) && level !== "ESCALATE";

  // A chip in the chat points here: open the row and bring it into view.
  useEffect(() => {
    const show = () => row.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (window.location.hash === `#${decision.id}`) show();
    return onShowEmail((id) => {
      if (id !== decision.id) return;
      setOpen(true);
      show();
    });
  }, [decision.id]);

  async function give(kind: FeedbackKind, editedText?: string) {
    setBusy(true);
    const ok = await onFeedback(kind, editedText);
    setBusy(false);
    if (ok) setEditing(false);
  }

  // "Always do this" on something still waiting also answers it (yes, or looks good), so it leaves
  // your list. Hard-to-undo asks still need the hold, so for those it only sets the rule.
  async function always() {
    const waiting = !answered && (level === "PROCEED_AND_NOTIFY" || (level === "ASK_FIRST" && !HOLD_TO_CONFIRM[decision.action]));
    if (waiting) {
      setBusy(true);
      const ok = await onFeedback("APPROVE");
      setBusy(false);
      if (!ok) return;
    }
    await give("ALWAYS_DO_THIS");
  }

  // The main buttons stay visible on the closed row; the rest show when it's open.
  const main = !answered && (
    <div className="flex shrink-0 gap-1.5">
      {level === "ESCALATE" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => give("SEEN")}>Got it</Button>
      )}
      {level === "ASK_FIRST" && (
        <>
          {HOLD_TO_CONFIRM[decision.action] ? (
            <HoldButton disabled={busy} onConfirm={() => give("APPROVE")}>Hold for yes</HoldButton>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => give("APPROVE")}>Yes</Button>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => give("REJECT")}>No</Button>
        </>
      )}
      {level === "PROCEED_AND_NOTIFY" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => give("APPROVE")}>Looks good</Button>
      )}
      {(level === "PROCEED_SILENTLY" || level === "PROCEED_AND_NOTIFY") && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => give("UNDO")}>Undo</Button>
      )}
    </div>
  );

  return (
    <motion.li
      ref={row}
      id={decision.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
      className="scroll-mt-4 rounded-2xl bg-card"
    >
      <div className="flex items-center gap-3 p-3 pl-4">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-muted-foreground">
            {/* Some phrases are in the subject (like "Invitation:"), so show it when that's where the match is. */}
            {decision.noticed && decision.subject.toLowerCase().includes(decision.noticed.toLowerCase()) && (
              <span className="mb-1 block font-medium text-foreground">
                <Highlight text={decision.subject} phrase={decision.noticed} className={MARK[level]} />
              </span>
            )}
            <Highlight text={decision.snippet} phrase={decision.noticed} className={MARK[level]} />
          </p>

          <p className="rounded-2xl bg-muted px-3 py-2 text-sm">{decision.message}</p>

          <button
            type="button"
            aria-expanded={why}
            onClick={() => setWhy(!why)}
            className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Why?
          </button>
          {why && (
            // Oscar's working notes: the real path the email took through decide().
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-muted/60 p-3 text-sm">
              {(decision.steps.length ? decision.steps : [LEVEL_SOURCES[decision.level_source]]).map((step) => (
                <li key={step} className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {step}
                </li>
              ))}
              {decision.safety_flags.length > 0 && (
                <li className="text-xs text-muted-foreground">
                  Safety checks: {decision.safety_flags.map((f) => FLAGS[f] ?? f).join(", ")}
                </li>
              )}
            </ul>
          )}

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
                <Button size="sm" variant="ghost" disabled={busy} onClick={always}>Always do this</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => give("ALWAYS_ASK_ME")}>Always ask me</Button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.li>
  );
}
