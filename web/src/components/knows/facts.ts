// What the "What Oscar knows" page says, worked out from real data only.

import type { Action, DecisionWithFeedback, FeedbackEvent, Level } from "@/lib/api";
import type { Taught } from "@/components/memory/facts";

const key = (sender: string, action: Action) => `${sender}|${action}`;

// Feedback on a stopped email, or one the floor blocked, teaches nothing (oscar/preferences.py).
const teaches = (f: FeedbackEvent) => !f.blocked_by_floor && f.autonomy_level !== "ESCALATE";
const ANSWERS = new Set(["APPROVE", "EDIT_THEN_SEND", "REJECT", "UNDO", "ALWAYS_DO_THIS"]);

/** When you last told him to forget each sender and action. Everything before it no longer counts. */
export function forgotAt(all: DecisionWithFeedback[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of all.flatMap((i) => i.feedback)) {
    if (f.kind !== "FORGET" || !teaches(f)) continue;
    const k = key(f.sender, f.action);
    if (f.created_at > (out.get(k) ?? "")) out.set(k, f.created_at);
  }
  return out;
}

// A review teaches him when it's a full answer, or a plain yes (oscar/review.py lessons).
const reviewTeaches = ({ decision, review }: DecisionWithFeedback) =>
  decision.source === "gmail" && !!review && review.label !== "SKIP" && (review.complete || review.label === "CORRECT") && decision.autonomy_level !== "ESCALATE";

/** The first answer that still counts for this sender and action, so the page can say how long ago it started. */
export function firstAnswer(all: DecisionWithFeedback[], sender: string, action: Action, forgot: Map<string, string>): string | null {
  const since = forgot.get(key(sender, action)) ?? "";
  let first: string | null = null;
  const take = (t: string) => {
    if (t > since && (first === null || t < first)) first = t;
  };
  for (const item of all) {
    for (const f of item.feedback) if (f.sender === sender && f.action === action && ANSWERS.has(f.kind) && teaches(f)) take(f.created_at);
    const { decision, review } = item;
    if (review && reviewTeaches(item) && decision.sender === sender && (decision.action === action || review.should_be_action === action)) {
      take(review.reviewed_at);
    }
  }
  return first;
}

/** Your answers on emails of one kind that still count, and how many senders they were about. */
export function kindAnswers(all: DecisionWithFeedback[], kind: string, forgot: Map<string, string>) {
  let answers = 0;
  const senders = new Set<string>();
  for (const item of all) {
    const { decision, review } = item;
    if ((decision.email_type ?? "unknown") !== kind) continue;
    for (const f of item.feedback) {
      if (!ANSWERS.has(f.kind) || !teaches(f) || f.created_at <= (forgot.get(key(f.sender, f.action)) ?? "")) continue;
      answers++;
      senders.add(f.sender);
    }
    if (review && reviewTeaches(item) && review.reviewed_at > (forgot.get(key(decision.sender, decision.action)) ?? "")) {
      answers++;
      senders.add(decision.sender);
    }
  }
  return { answers, senders: senders.size };
}

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** "You okayed it 6 times and said no once": what taught him, in plain words. Null with nothing to count. */
export function evidenceLine(t: Taught): string | null {
  const parts = [
    t.okayed && `okayed it ${times(t.okayed)}`,
    t.declined && `said no ${times(t.declined)}`,
    t.undone && `undid it ${times(t.undone)}`,
    t.reviews && `reviewed it ${times(t.reviews)}`,
    t.alwaysDo && `told me “always do this”${t.alwaysDo > 1 ? ` ${times(t.alwaysDo)}` : ""}`,
  ].filter((p): p is string => !!p);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `You ${list}`;
}

/** "started 2 weeks ago", from the first answer that still counts. */
export function startedAgo(iso: string, now: number) {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return "started today";
  if (days === 1) return "started yesterday";
  if (days < 14) return `started ${days} days ago`;
  if (days < 60) return `started ${Math.floor(days / 7)} weeks ago`;
  return `started ${Math.floor(days / 30)} months ago`;
}

// "I mark emails from X as read": the words either side of the sender's name, for each action.
export const AROUND: Record<Action, [string, string]> = {
  MARK_READ: ["mark emails from ", " as read"],
  ARCHIVE: ["archive emails from ", ""],
  APPLY_LABEL: ["label emails from ", ""],
  DRAFT_REPLY: ["draft replies to ", ""],
  SEND_REPLY: ["reply to ", ""],
  FORWARD: ["forward emails from ", ""],
  UNSUBSCRIBE: ["unsubscribe you from ", ""],
  ACCEPT_MEETING: ["accept invites from ", ""],
  PERMANENTLY_DELETE: ["delete emails from ", " for good"],
  SEND_CREDENTIALS: ["send credentials to ", ""],
  MOVE_MONEY: ["move money for ", ""],
};

// Where he starts with a kind, in the words of the status: "Label it quietly", "Ask you first".
const IT: Record<Action, string> = {
  MARK_READ: "Mark as read",
  ARCHIVE: "Archive it",
  APPLY_LABEL: "Label it",
  DRAFT_REPLY: "Draft a reply",
  SEND_REPLY: "Send a reply",
  FORWARD: "Forward it",
  UNSUBSCRIBE: "Unsubscribe",
  ACCEPT_MEETING: "Accept it",
  PERMANENTLY_DELETE: "Delete it for good",
  SEND_CREDENTIALS: "Send credentials",
  MOVE_MONEY: "Move money",
};

export function startWords(level: Level, action: Action) {
  switch (level) {
    case "PROCEED_SILENTLY":
      return `${IT[action]} quietly`;
    case "PROCEED_AND_NOTIFY":
      return `${IT[action]} and tell you`;
    case "ASK_FIRST":
      return "Ask you first";
    case "ESCALATE":
      return "Bring it to you";
  }
}

export const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
