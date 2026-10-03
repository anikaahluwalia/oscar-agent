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

/**
 * On the real inbox Oscar only says he does something when he really can: acting is on and it's
 * one of the few things he does in Gmail. Otherwise it's what he would do.
 */
export function onlyWould(data: OscarData, action: Action) {
  return data.gmail.connected && (isReadOnly(data) || !data.gmail.acting || !DOABLE.has(action));
}

/** On the real inbox, actions other than mark read, archive and label are never done in Gmail. */
export const notInGmail = (data: OscarData, action: Action) => data.gmail.connected && !DOABLE.has(action);

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
