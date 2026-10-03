"use client";

import { BellIcon, CheckIcon, ChevronRightIcon, CircleHelpIcon, ShieldAlertIcon } from "lucide-react";
import { Checklist } from "@/components/kit/checklist";
import { OscarAvatar } from "@/components/oscar-avatar";
import { DecisionControls } from "@/components/review/decision-controls";
import { outcomeOf } from "@/components/review/filters";
import { ReviewPanel } from "@/components/review-panel";
import { StatusPill } from "@/components/status-pill";
import type { DecisionWithFeedback, Level } from "@/lib/api";
import { openWhy } from "@/lib/drawers";
import { reallyDone, safetyChecks, whatItIs } from "@/lib/insights";
import { DOABLE, REPLIES, STATUS, wouldOnly } from "@/lib/labels";
import type { useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

type Feedback = ReturnType<typeof useOscar>["feedback"];

const ICONS: Record<Level, typeof CheckIcon> = {
  PROCEED_SILENTLY: CheckIcon,
  PROCEED_AND_NOTIFY: BellIcon,
  ASK_FIRST: CircleHelpIcon,
  ESCALATE: ShieldAlertIcon,
};

const said = (i: DecisionWithFeedback, kind: string) => i.feedback.some((f) => f.kind === kind);

/** Where things stand, in a few words. Only says he did something if he really did. */
function headline(item: DecisionWithFeedback): string {
  const d = item.decision;
  const would = wouldOnly(d);
  const real = d.source === "gmail";
  if (d.autonomy_level === "ESCALATE") return would ? "He'd stop this and bring it to you" : "Stopped. Nothing was done";
  if (d.autonomy_level === "ASK_FIRST") {
    if (would) return "He'd ask you first";
    if (said(item, "APPROVE")) return "You said yes";
    if (said(item, "REJECT")) return "You said no";
    return "Asking for your okay";
  }
  if (real ? !!item.done?.undone_at : said(item, "UNDO")) return "Undone";
  if (!reallyDone(item)) return "He'd do this on his own";
  return d.autonomy_level === "PROCEED_AND_NOTIFY" ? "Done, and he told you" : "Done quietly";
}

function reasonsTitle(item: DecisionWithFeedback): string {
  const would = wouldOnly(item.decision);
  if (item.decision.autonomy_level === "ASK_FIRST") return would ? "Why I'd ask" : "Why I'm asking";
  if (item.decision.autonomy_level === "ESCALATE") return would ? "Why I'd stop it" : "Why I stopped it";
  return would ? "Why I'd do it" : "Why I did it";
}

/** Oscar's own note, unless it would say he did something in Gmail that he didn't. */
function safeMessage(item: DecisionWithFeedback): string | null {
  const d = item.decision;
  if (d.source !== "gmail" || !d.acting) return d.message;
  if (d.autonomy_level === "ASK_FIRST" || d.autonomy_level === "ESCALATE") return d.message;
  return reallyDone(item) ? d.message : null;
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

/**
 * Oscar's decision on the open email: where it stands, what he'd do or did, why, and your
 * controls. On the real inbox it ends with the full-answer grading, which also teaches him.
 */
export function DecisionPanel({
  item,
  canAct,
  feedback,
  className,
}: {
  item: DecisionWithFeedback;
  /** Gmail is connected and "Let Oscar act in Gmail" is on. */
  canAct: boolean;
  feedback: Feedback;
  className?: string;
}) {
  const d = item.decision;
  const level = d.autonomy_level;
  const real = d.source === "gmail";
  const would = wouldOnly(d);
  const Icon = ICONS[level];
  // The first note names the sender and the last is the outcome; both are shown already.
  const reasons = d.steps.slice(1, -1);
  const what = whatItIs(d);
  const message = safeMessage(item);
  const checks = safetyChecks(d);
  const found = checks.filter((c) => !c.ok).length;
  const actionLabel = would ? "What he'd do" : level === "ASK_FIRST" && !said(item, "APPROVE") && !said(item, "REJECT") ? "Proposed action" : "What happened";

  return (
    <section aria-label="Oscar's decision" className={cn("flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-card", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Oscar&apos;s decision</h2>
          <StatusPill level={level} readOnly={would} />
        </div>
        <p className={cn("flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-sm font-semibold", STATUS[level].pill)}>
          <Icon className="size-4 shrink-0" aria-hidden />
          {headline(item)}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label>{actionLabel}</Label>
        <p className="font-medium">{outcomeOf(item)}</p>
        {REPLIES.has(d.action) && (
          <p className="text-sm text-muted-foreground">
            {real
              ? "Oscar doesn't write or send replies, so there's no draft. If it needs an answer, reply in Gmail yourself."
              : "This is an example, so there's no draft to show. On your real inbox Oscar never writes or sends replies."}
          </p>
        )}
        {real && d.acting && !DOABLE.has(d.action) && !REPLIES.has(d.action) && level !== "ESCALATE" && (
          <p className="text-sm text-muted-foreground">This isn&apos;t something he does in Gmail, so nothing changed there.</p>
        )}
        {real && !d.acting && <p className="text-sm text-muted-foreground">He was only reading your inbox then, so nothing changed in Gmail.</p>}
      </div>

      {what && (
        <div className="flex flex-col gap-1">
          <Label>What this is</Label>
          <p className="text-sm">
            {what}
            {d.understood_by === "model" && <span className="text-muted-foreground"> (read by the model)</span>}
          </p>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-2.5">
          <OscarAvatar size={28} mood={level === "ESCALATE" ? "alert" : level === "ASK_FIRST" ? "curious" : "calm"} />
          <p className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm">{message}</p>
        </div>
      )}

      {reasons.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{reasonsTitle(item)}</Label>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {reasons.map((r) => (
              <li key={r} className="flex gap-1.5">
                <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-foreground/60" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group rounded-xl border px-3.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span>
            Safety checks
            <span className={cn("ml-2 font-normal", found ? "text-status-blocked" : "text-muted-foreground")}>
              {found ? `${found} found` : "nothing found"}
            </span>
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <Checklist items={checks} className="pb-3.5" />
      </details>

      <DecisionControls item={item} canAct={canAct} feedback={feedback} />

      <button
        type="button"
        onClick={() => openWhy(d.id)}
        className="-my-2 flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Why this decision?
      </button>

      {real && (
        <div className="flex flex-col gap-2 border-t pt-5">
          <Label>Grade his call</Label>
          <ReviewPanel key={d.id} item={item} />
          <p className="text-xs text-muted-foreground">Each answer grades Oscar and teaches him about this sender.</p>
        </div>
      )}
    </section>
  );
}
