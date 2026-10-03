"use client";

import { useState } from "react";
import {
  ArchiveIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  ForwardIcon,
  KeyRoundIcon,
  LockIcon,
  MailMinusIcon,
  MailOpenIcon,
  PenLineIcon,
  SendIcon,
  TagIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { lockFor } from "@/components/ladder";
import { evidenceOf, senderParts, taughtLine, whatHeDoes, type MemoryItem } from "@/components/memory/facts";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { Action, FeedbackKind } from "@/lib/api";
import { ACTIONS, STATUS } from "@/lib/labels";
import type { Answers } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

/** "Approved 3 · declined 1": how you've actually answered, counted from your feedback. Used by the Why drawer. */
export function answerLine(a: Answers) {
  const parts = [a.approved && `approved ${a.approved}`, a.declined && `declined ${a.declined}`, a.undone && `undone ${a.undone}`].filter(Boolean);
  if (!parts.length) return "No answers yet";
  const line = parts.join(" · ");
  return line[0].toUpperCase() + line.slice(1);
}

const ICONS: Record<Action, LucideIcon> = {
  MARK_READ: MailOpenIcon,
  ARCHIVE: ArchiveIcon,
  APPLY_LABEL: TagIcon,
  DRAFT_REPLY: PenLineIcon,
  SEND_REPLY: SendIcon,
  FORWARD: ForwardIcon,
  UNSUBSCRIBE: MailMinusIcon,
  ACCEPT_MEETING: CalendarCheckIcon,
  PERMANENTLY_DELETE: Trash2Icon,
  SEND_CREDENTIALS: KeyRoundIcon,
  MOVE_MONEY: BanknoteIcon,
};

type Props = {
  item: MemoryItem;
  /** On the real inbox, Oscar only says what he would do unless he really can do it. */
  would: boolean;
  /** The real inbox and an action Oscar never does in Gmail, so it stays yours to do. */
  outsideGmail: boolean;
  onFeedback: (decisionId: string, kind: FeedbackKind) => Promise<unknown>;
};

/** Something Oscar has learned about one sender and action: what he does now, what taught him, and ways to change it. */
export function PreferenceCard({ item, would, outsideGmail, onFeedback }: Props) {
  const { learned, limits, taught, decisionId, flagged, level, reason } = item;
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const { name, address } = senderParts(learned.sender);
  const Icon = ICONS[learned.action];
  const stillLearning = learned.level === null && !learned.always_ask;
  const said = taughtLine(taught);
  const evidence = evidenceOf(taught);
  // Oscar's own estimate (oscar/preferences.py). It starts at 50% before any answer, so it's only shown once there's evidence.
  const sure = !learned.always_ask && learned.yes + learned.no > 0 ? Math.round(learned.mean * 100) : null;

  const lock = limits ? lockFor(limits, "PROCEED_AND_NOTIFY") : null;
  const canDoMore = !lock && !flagged && level !== "ESCALATE" && (learned.always_ask || level !== "PROCEED_SILENTLY");
  const canAsk = !learned.always_ask && level !== "ESCALATE";

  const send = async (kind: FeedbackKind) => {
    if (!decisionId || busy) return;
    setBusy(true);
    await onFeedback(decisionId, kind);
    setBusy(false);
    setConfirmForget(false);
  };

  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            level ? STATUS[level].pill : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate font-semibold" title={learned.sender}>
            {name}
          </p>
          {address && <p className="truncate text-xs text-muted-foreground">{address}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{ACTIONS[learned.action]}</span>
            {level && <StatusPill level={level} readOnly={would} />}
          </div>
        </div>
      </div>

      <p className="text-sm">
        {stillLearning && "Still learning. "}
        {level ? whatHeDoes(level, learned.action, reason, would, outsideGmail) : "Not enough answers yet to change what I do."}
      </p>

      <div className="flex flex-col gap-1.5">
        {sure !== null && (
          <p className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">How sure: {sure}%</p>
        )}
        <p className="text-xs text-muted-foreground">
          {said ? `Learned from ${evidence === 1 ? "1 answer" : `${evidence} answers`}: ${said}` : "No answers yet"}
          {learned.always_ask && " · Your rule: always ask"}
        </p>
      </div>

      {lock && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockIcon className="size-3.5 shrink-0" aria-hidden />
          {lock.replace(/^Locked: /, "")}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {!decisionId ? (
          <p className="text-xs text-muted-foreground">I need a recent email from this sender before you can change this here.</p>
        ) : confirmForget ? (
          <div role="group" aria-label={`Forget ${name}, ${ACTIONS[learned.action]}?`} className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Start fresh with this sender?</span>
            <Button variant="destructive" className="h-11 px-4 sm:h-9" disabled={busy} onClick={() => send("FORGET")}>
              Forget
            </Button>
            <Button variant="ghost" className="h-11 px-4 sm:h-9" disabled={busy} onClick={() => setConfirmForget(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <>
            {canDoMore && (
              <Button variant="outline" className="h-11 px-4 sm:h-9" disabled={busy} onClick={() => send("ALWAYS_DO_THIS")}>
                Always do this
              </Button>
            )}
            {canAsk && (
              <Button variant="outline" className="h-11 px-4 sm:h-9" disabled={busy} onClick={() => send("ALWAYS_ASK_ME")}>
                Always ask me
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-11 px-4 text-muted-foreground sm:h-9"
              disabled={busy}
              onClick={() => setConfirmForget(true)}
            >
              Forget
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
