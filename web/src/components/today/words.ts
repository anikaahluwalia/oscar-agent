// What Today says, worked out from Oscar's real decisions.

import type { Action, DecisionWithFeedback } from "@/lib/api";
import { addressOf } from "@/components/kit/sender";
import { plural } from "@/lib/counts";
import { reallyDone, timeOf } from "@/lib/insights";
import { ACTIONS, KIND_NAMES, wouldOnly } from "@/lib/labels";

const SMALL = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** "Two things", "One thing", "12 things": small numbers in words, the way Oscar says them. */
export const say = (n: number, one: string, many: string) => `${n < 10 ? SMALL[n] : n.toLocaleString()} ${n === 1 ? one : many}`;

const ON_OWN = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);

/** Midnight this morning, by this device's clock. */
export function startOfToday(now: number) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const handledAt = (i: DecisionWithFeedback) => new Date(i.done?.done_at ?? i.decision.created_at).getTime();

const DID: Partial<Record<Action, (n: number) => string>> = {
  MARK_READ: (n) => `Marked ${n.toLocaleString()} as read`,
  ARCHIVE: (n) => `Archived ${n.toLocaleString()}`,
  APPLY_LABEL: (n) => `Labelled ${n.toLocaleString()}`,
  DRAFT_REPLY: (n) => `Drafted ${plural(n, "reply", "replies")}`,
};
const WOULD: Partial<Record<Action, (n: number) => string>> = {
  MARK_READ: (n) => `Would mark ${n.toLocaleString()} as read`,
  ARCHIVE: (n) => `Would archive ${n.toLocaleString()}`,
  APPLY_LABEL: (n) => `Would label ${n.toLocaleString()}`,
  DRAFT_REPLY: (n) => `Would draft ${plural(n, "reply", "replies")}`,
};

/**
 * What Oscar took care of since `since`, one chip per action, biggest first. Same rule as
 * handledSince: only what really happened, or while he only reads Gmail, what he would have done.
 */
export function tookCare(items: DecisionWithFeedback[], since: number, readOnly: boolean): { action: Action; n: number; label: string }[] {
  const counts = new Map<Action, number>();
  for (const i of items) {
    const counted = readOnly ? wouldOnly(i.decision) && ON_OWN.has(i.decision.autonomy_level) : reallyDone(i);
    if (counted && handledAt(i) >= since) counts.set(i.decision.action, (counts.get(i.decision.action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([action, n]) => {
      const words = (readOnly ? WOULD : DID)[action];
      return { action, n, label: words ? words(n) : `${readOnly ? "Would " + ACTIONS[action].toLowerCase() : ACTIONS[action]}: ${n.toLocaleString()}` };
    });
}

/**
 * Small facts about an email for its card: what kind it is, and what Oscar knows about the sender.
 * Only what the data says. The demo inbox is the whole inbox, so there "first email" is known;
 * on Gmail he only reads recent mail, so he only says how many earlier ones he's seen.
 */
export function tagsFor(item: DecisionWithFeedback, items: DecisionWithFeedback[]): string[] {
  const { decision } = item;
  const tags: string[] = [];
  const kind = decision.email_type;
  if (kind && kind !== "unknown" && kind !== "bulk") tags.push(KIND_NAMES[kind] ?? kind.replace(/_/g, " "));

  const from = (addressOf(decision.sender) || decision.sender).toLowerCase();
  const at = timeOf(item);
  const earlier = items.filter(
    (i) => i.decision.id !== decision.id && (addressOf(i.decision.sender) || i.decision.sender).toLowerCase() === from && timeOf(i) < at,
  ).length;
  if (earlier) tags.push(`${earlier.toLocaleString()} earlier from them`);
  else if (decision.source !== "gmail") tags.push("First email from them");

  if (decision.gmail?.emailed_before === true) tags.push("You've emailed them");
  else if (decision.gmail?.emailed_before === false) tags.push("You've never emailed them");
  return tags;
}

/** The few words next to Oscar's note: what kind of wait this is. */
export function waitWords(item: DecisionWithFeedback, readOnly: boolean) {
  if (readOnly || wouldOnly(item.decision)) return "Check my call";
  return item.decision.autonomy_level === "ESCALATE" ? "I held this back" : "Asking first";
}
