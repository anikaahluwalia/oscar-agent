// What the "What Oscar knows" page says about one learned sender and action, worked out from real data only.

import type { Action, AutonomyRow, DecisionWithFeedback, LearnedRow, Level } from "@/lib/api";
import { DOABLE } from "@/lib/labels";
import { isReadOnly, type OscarData } from "@/lib/use-oscar";

/** What Oscar learned from, counted since you last told him to forget this sender and action. */
export type Taught = {
  okayed: number;
  declined: number;
  undone: number;
  alwaysDo: number;
  alwaysAsk: number;
  reviews: number; // real inbox: your reviews teach him too (oscar/review.py lessons)
};

const same = (sender: string, action: Action) => (s: string, a: Action) => s === sender && a === action;

/**
 * Counts what Oscar learned from for one sender and action. Mirrors Preferences in oscar/preferences.py:
 * add() ignores feedback on stopped emails or blocked by a protected rule, and from_feedback() drops
 * everything before a Forget.
 */
export function taughtBy(all: DecisionWithFeedback[], sender: string, action: Action): Taught {
  const match = same(sender, action);
  const events = all.flatMap((i) => i.feedback).filter((f) => match(f.sender, f.action));
  // A Forget on a stopped email (or one the floor blocked) is skipped here. The server would still count it,
  // but the app never sends one: decisionFor never picks a stopped email.
  const forgotAt = events
    .filter((f) => f.kind === "FORGET" && !f.blocked_by_floor && f.autonomy_level !== "ESCALATE")
    .reduce((latest, f) => (f.created_at > latest ? f.created_at : latest), "");
  const out: Taught = { okayed: 0, declined: 0, undone: 0, alwaysDo: 0, alwaysAsk: 0, reviews: 0 };
  for (const f of events) {
    if (f.created_at <= forgotAt || f.blocked_by_floor || f.autonomy_level === "ESCALATE") continue;
    if (f.kind === "APPROVE" || f.kind === "EDIT_THEN_SEND") out.okayed++;
    if (f.kind === "REJECT") out.declined++;
    if (f.kind === "UNDO") out.undone++;
    if (f.kind === "ALWAYS_DO_THIS") out.alwaysDo++;
    if (f.kind === "ALWAYS_ASK_ME") out.alwaysAsk++;
  }
  for (const { decision, review } of all) {
    if (decision.source !== "gmail" || !review || review.label === "SKIP") continue;
    if (!review.complete && review.label !== "CORRECT") continue; // a half-answer teaches nothing
    if (decision.autonomy_level === "ESCALATE" || decision.sender !== sender) continue;
    if (decision.action !== action && review.should_be_action !== action) continue;
    if (review.reviewed_at <= forgotAt) continue;
    out.reviews++;
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 okays, 1 decline and 2 reviews", or null when there's nothing to count. */
export function taughtLine(t: Taught): string | null {
  const parts = [
    t.okayed && plural(t.okayed, "okay", "okays"),
    t.declined && plural(t.declined, "decline", "declines"),
    t.undone && plural(t.undone, "undo", "undos"),
    t.reviews && plural(t.reviews, "review", "reviews"),
    t.alwaysDo && (t.alwaysDo === 1 ? "“Always do this” once" : `“Always do this” ${t.alwaysDo} times`),
  ].filter((p): p is string => !!p);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Answers that count as real evidence (the rule "Always ask me" isn't evidence). */
export const evidenceOf = (t: Taught) => t.okayed + t.declined + t.undone + t.reviews + t.alwaysDo;

/**
 * A decision to send feedback on for this sender and action. Feedback takes its sender and action
 * from the decision, and feedback on a stopped email teaches nothing, so it must match and not be stopped.
 * flagged: the email had a safety flag, so "Always do this" on it would be blocked (oscar/feedback.py floor_reply).
 */
export function decisionFor(
  data: OscarData,
  sender: string,
  action: Action,
  limits?: AutonomyRow,
): { id: string; flagged: boolean } | null {
  const ok = (i: DecisionWithFeedback) =>
    i.decision.sender === sender && i.decision.action === action && i.decision.autonomy_level !== "ESCALATE";
  // One with no safety flags, when there is one: "Always do this" on a flagged email is blocked by the floor.
  const clean = (i: DecisionWithFeedback) => ok(i) && i.decision.safety_flags.length === 0;
  const known = limits ? data.all.find((i) => i.decision.id === limits.decision_id) : undefined;
  const pick = known && clean(known) ? known : (data.all.find(clean) ?? (known && ok(known) ? known : data.all.find(ok))); // newest first
  return pick ? { id: pick.decision.id, flagged: pick.decision.safety_flags.length > 0 } : null;
}

// How each action reads in "I archive these on my own".
const THESE: Record<Action, string> = {
  MARK_READ: "mark these as read",
  ARCHIVE: "archive these",
  APPLY_LABEL: "label these",
  DRAFT_REPLY: "draft a reply to these",
  SEND_REPLY: "reply to these",
  FORWARD: "forward these",
  UNSUBSCRIBE: "unsubscribe you from these",
  ACCEPT_MEETING: "accept these invites",
  PERMANENTLY_DELETE: "delete these for good",
  SEND_CREDENTIALS: "send credentials",
  MOVE_MONEY: "move money",
};

/**
 * On the real inbox Oscar only says he does something when he really can: acting is on and it's
 * one of the few things he does in Gmail. Otherwise it's what he would do.
 */
export function onlyWould(data: OscarData, action: Action) {
  return data.gmail.connected && (isReadOnly(data) || !data.gmail.acting || !DOABLE.has(action));
}

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** On the real inbox, actions other than mark read, archive and label are never done in Gmail. */
export const notInGmail = (data: OscarData, action: Action) => data.gmail.connected && !DOABLE.has(action);

/**
 * One plain sentence for what Oscar does now with this sender and action, and why. outsideGmail:
 * the real inbox and an action he never does there (a reply, unsubscribing...), so it stays yours.
 */
export function whatHeDoes(level: Level, action: Action, reason: string, would: boolean, outsideGmail = false): string {
  const these = THESE[action];
  const why = reason ? `, since ${reason}` : "";
  const yours = outsideGmail ? " I don't do this in Gmail, so it stays yours to do." : "";
  switch (level) {
    case "PROCEED_SILENTLY":
      return `${would ? "I'd" : "I"} ${these} on my own${why}.${yours}`;
    case "PROCEED_AND_NOTIFY":
      return `${would ? "I'd" : "I"} ${these} and tell you${why}.${yours}`;
    case "ASK_FIRST":
      return `${would ? "I'd ask" : "I ask"} you before I ${these}${why}.${yours}`;
    case "ESCALATE":
      return reason ? `These always come to you. ${cap(reason)}.` : "These always come to you.";
  }
}

export type MemoryItem = {
  learned: LearnedRow;
  limits?: AutonomyRow;
  taught: Taught;
  decisionId: string | null;
  /** The email the buttons answer on had a safety flag, so "Always do this" would teach nothing. */
  flagged: boolean;
  level: Level | null; // what he does now, after the protected rules
  reason: string;
  /** You asked to always be asked, or you've mostly turned him down and he asks now. */
  asks: boolean;
};

/** Every learned sender and action, one item each, for the sender rows on the "What Oscar knows" page. */
export function memoryItems(data: OscarData): MemoryItem[] {
  return data.learned
    .map((learned) => {
      const limits = data.autonomy.find((r) => r.sender === learned.sender && r.action === learned.action);
      // The autonomy row has the level after the protected rules, so it wins when there is one.
      const level = limits?.level ?? learned.level;
      const pick = decisionFor(data, learned.sender, learned.action, limits);
      const reason =
        level === "ESCALATE" ? (limits?.reason ?? "") : learned.always_ask || !limits ? learned.reason : limits.reason;
      return {
        learned,
        limits,
        taught: taughtBy(data.all, learned.sender, learned.action),
        decisionId: pick?.id ?? null,
        flagged: pick?.flagged ?? false,
        level,
        reason,
        // Only where he really does ask now: a few no's can leave him at "Tell me", which isn't asking.
        asks: learned.always_ask || (learned.no > learned.yes && (level === "ASK_FIRST" || level === "ESCALATE")),
      };
    })
    .sort((a, b) => b.learned.yes + b.learned.no - (a.learned.yes + a.learned.no) || a.learned.sender.localeCompare(b.learned.sender));
}

/** The name part of "Name <address>", and the address when there is one. */
export function senderParts(sender: string): { name: string; address: string | null } {
  const address = sender.match(/<([^>]+)>/)?.[1] ?? null;
  const name = sender.replace(/<.*>/, "").replace(/"/g, "").trim();
  return { name: name || address || sender, address: name ? address : null };
}
