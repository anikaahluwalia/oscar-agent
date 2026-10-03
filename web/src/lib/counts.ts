// What Oscar counts for the pages. Every number is worked out from Oscar's real decisions.

import type { DecisionWithFeedback } from "@/lib/api";
import { reallyDone } from "@/lib/insights";
import { ACTIONS, isOldWay, needsReview, whatOscarDid, wouldOnly } from "@/lib/labels";
import { dayLabel, formatTime } from "@/lib/time";
import { isOpen, isReadOnly, type OscarData } from "@/lib/use-oscar";

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const ON_OWN = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);

/** What's waiting on you, most urgent first: what he stopped, then what he asked about.
 * While he only reads Gmail, his calls to check, then old reviews to finish. */
export function waiting(data: OscarData): DecisionWithFeedback[] {
  if (isReadOnly(data)) {
    const calls = data.items.filter(needsReview);
    return [...calls.filter((i) => !isOldWay(i.review)), ...calls.filter((i) => isOldWay(i.review))];
  }
  const open = data.items.filter(isOpen);
  return [...open.filter((i) => i.decision.autonomy_level === "ESCALATE"), ...open.filter((i) => i.decision.autonomy_level === "ASK_FIRST")];
}

/** When Oscar handled it: when Gmail says he did it, or when he decided (demo, read-only). */
const handledAt = (i: DecisionWithFeedback) => new Date(i.done?.done_at ?? i.decision.created_at).getTime();

/**
 * How many emails Oscar handled on his own since `since`. While he only reads Gmail, how many he
 * would have handled: nothing changed in Gmail.
 */
export function handledSince(data: OscarData, since: number): number {
  if (isReadOnly(data)) {
    return data.items.filter((i) => wouldOnly(i.decision) && ON_OWN.has(i.decision.autonomy_level) && handledAt(i) >= since).length;
  }
  return data.items.filter((i) => reallyDone(i) && handledAt(i) >= since).length;
}

export type Impact = { emails: number; onOwn: number; asked: number; stopped: number };

/**
 * What Oscar did with these emails. While he only reads Gmail it's what he would have done.
 * Otherwise only what really happened: handled means Gmail says he did it (or the demo did),
 * and an ask only counts if it came to you.
 */
export function impactOf(items: DecisionWithFeedback[], readOnly: boolean): Impact {
  const level = (i: DecisionWithFeedback) => i.decision.autonomy_level;
  if (readOnly) {
    return {
      emails: items.length,
      onOwn: items.filter((i) => ON_OWN.has(level(i))).length,
      asked: items.filter((i) => level(i) === "ASK_FIRST").length,
      stopped: items.filter((i) => level(i) === "ESCALATE").length,
    };
  }
  return {
    emails: items.length,
    onOwn: items.filter(reallyDone).length,
    asked: items.filter((i) => level(i) === "ASK_FIRST" && !wouldOnly(i.decision)).length,
    stopped: items.filter((i) => level(i) === "ESCALATE" && !wouldOnly(i.decision)).length,
  };
}

/** The sender's name without the address, for cards. */
export const senderName = (sender: string) => sender.replace(/<.*>/, "").replace(/"/g, "").trim() || sender;

/** "9:14 AM" today, "Yesterday" or a short date ("Sep 28") before that, so it fits a narrow column. */
export function when(iso: string) {
  const day = dayLabel(iso);
  if (day === "Today") return formatTime(iso);
  if (day === "Yesterday") return day;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * One line for what Oscar did, for Today and the chat's email cards. Like whatOscarDid, but on the demo inbox
 * an action you undid says so, instead of still saying he did it.
 */
export function didLine({ decision, done, feedback }: DecisionWithFeedback): string {
  const undone = decision.source !== "gmail" && ON_OWN.has(decision.autonomy_level) && feedback.some((f) => f.kind === "UNDO");
  return undone ? `Undone: ${ACTIONS[decision.action].toLowerCase()}` : whatOscarDid(decision, done);
}
