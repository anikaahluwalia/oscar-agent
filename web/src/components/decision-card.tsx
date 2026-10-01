"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { MOOD_FOR_LEVEL, OscarAvatar } from "@/components/oscar-avatar";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { LevelTag } from "@/components/level-tag";
import { ACTIONS, FEEDBACK, FLAGS, LEVEL_SOURCES } from "@/lib/labels";

const REPLIES = new Set(["DRAFT_REPLY", "SEND_REPLY"]);

type Props = {
  item: DecisionWithFeedback;
  index?: number;
  dimmed?: boolean;
  onFeedback: (kind: FeedbackKind, editedText?: string) => Promise<boolean>;
};

export function DecisionCard({ item, index = 0, dimmed, onFeedback }: Props) {
  const { decision, feedback } = item;
  const level = decision.autonomy_level;
  const [showWhy, setShowWhy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function give(kind: FeedbackKind, editedText?: string) {
    setBusy(true);
    const ok = await onFeedback(kind, editedText);
    setBusy(false);
    if (ok) setEditing(false);
  }

  const answered = feedback.some((f) => ["APPROVE", "REJECT", "UNDO", "EDIT_THEN_SEND"].includes(f.kind));
  const canEdit = REPLIES.has(decision.action) && level !== "ESCALATE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dimmed ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.04 }}
    >
      <Card className="gap-3">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{decision.sender}</p>
            <p className="truncate font-medium">{decision.subject}</p>
          </div>
          <LevelTag level={level} />
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <p className="line-clamp-2 text-sm text-muted-foreground">{decision.snippet}</p>

          <div className="flex items-start gap-2">
            <OscarAvatar size={36} mood={MOOD_FOR_LEVEL[level]} />
            <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">{decision.explanation}</div>
          </div>

          <button
            type="button"
            onClick={() => setShowWhy(!showWhy)}
            className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {showWhy ? "Hide details" : "Why?"}
          </button>
          {showWhy && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-xs">
              <dt className="text-muted-foreground">Proposed action</dt>
              <dd>{ACTIONS[decision.action]}</dd>
              <dt className="text-muted-foreground">Why this level</dt>
              <dd>{LEVEL_SOURCES[decision.level_source]}</dd>
              <dt className="text-muted-foreground">What I noticed</dt>
              <dd>{decision.matched_pattern ? `"${decision.matched_pattern}"` : "Nothing matched, so it's a guess"}</dd>
              <dt className="text-muted-foreground">Safety checks</dt>
              <dd>{decision.safety_flags.length ? decision.safety_flags.map((f) => FLAGS[f] ?? f).join(", ") : "Nothing flagged"}</dd>
            </dl>
          )}

          {editing && (
            <div className="flex flex-col gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the reply you want to send" />
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
        </CardContent>

        <CardFooter className="flex flex-wrap items-center gap-2">
          {feedback.length > 0 && (
            <p className="mr-auto text-xs text-muted-foreground">
              You said: {feedback.map((f) => FEEDBACK[f.kind]).join(", ")}
            </p>
          )}

          {level === "ESCALATE" ? (
            <p className="text-xs text-muted-foreground">I won&apos;t act on this one. It&apos;s yours.</p>
          ) : (
            <>
              {!answered && level === "ASK_FIRST" && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => give("APPROVE")}>
                    Yes, go ahead
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => give("REJECT")}>
                    No
                  </Button>
                </>
              )}
              {!answered && level === "PROCEED_AND_NOTIFY" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => give("APPROVE")}>
                  Looks good
                </Button>
              )}
              {!answered && level !== "ASK_FIRST" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => give("UNDO")}>
                  Undo
                </Button>
              )}
              {!answered && canEdit && !editing && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                  Edit and send
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => give("ALWAYS_DO_THIS")}>
                Always do this
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => give("ALWAYS_ASK_ME")}>
                Always ask me
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
