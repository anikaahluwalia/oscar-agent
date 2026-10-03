import { BellIcon, CheckIcon, CircleHelpIcon, EyeIcon, ShieldAlertIcon, Undo2Icon, XIcon } from "lucide-react";
import { didIt, isUndone } from "@/components/activity/outcome";
import type { ActionDone, Decision, FeedbackEvent } from "@/lib/api";
import { wouldOnly } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * A small icon for one line of the log. A tick or a bell only when he really did it (didIt);
 * an eye when he only read the email, so the icon never claims more than the words.
 */
export function RowIcon({ decision, done, feedback = [], className }: { decision: Decision; done?: ActionDone | null; feedback?: FeedbackEvent[]; className?: string }) {
  const level = decision.autonomy_level;
  const base = cn("size-4 shrink-0", className);

  if (level === "ESCALATE") return <ShieldAlertIcon aria-hidden className={cn(base, "text-status-blocked")} />;
  if (isUndone(decision, done, feedback)) return <Undo2Icon aria-hidden className={cn(base, "text-muted-foreground")} />;
  if (didIt(decision, done, feedback)) {
    return level === "PROCEED_AND_NOTIFY" ? (
      <BellIcon aria-hidden className={cn(base, "text-status-fyi")} />
    ) : (
      <CheckIcon aria-hidden className={cn(base, "text-status-handled")} />
    );
  }
  if (level === "ASK_FIRST") {
    if (!wouldOnly(decision) && feedback.some((f) => f.kind === "REJECT")) return <XIcon aria-hidden className={cn(base, "text-muted-foreground")} />;
    // The demo has no Gmail record: your okay is what happened. (On Gmail, didIt above covers it.)
    if (decision.source !== "gmail" && feedback.some((f) => f.kind === "APPROVE" || f.kind === "EDIT_THEN_SEND")) {
      return <CheckIcon aria-hidden className={cn(base, "text-status-handled")} />;
    }
    return <CircleHelpIcon aria-hidden className={cn(base, wouldOnly(decision) ? "text-muted-foreground" : "text-status-needs")} />;
  }
  return <EyeIcon aria-hidden className={cn(base, "text-muted-foreground")} />;
}
