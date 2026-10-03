// What a "Not quite" can say, and how it's checked. Mirrors oscar/review.py, and the grading
// that was in components/review-panel.tsx: the same choices and the same answer sent.

import type { Action, DecisionWithFeedback, Level, Reason, Review, ReviewInput, Why } from "@/lib/api";
import { ACTIONS, REVIEW_LABELS } from "@/lib/labels";

/** How much he should have done on his own, in your words. */
export const LEVELS: { level: Level; label: string }[] = [
  { level: "PROCEED_SILENTLY", label: "Handled it quietly" },
  { level: "PROCEED_AND_NOTIFY", label: "Handled it and told me" },
  { level: "ASK_FIRST", label: "Asked me first" },
  { level: "ESCALATE", label: "Only told me, I'll deal with it" },
];

// What each level can be done with. Oscar never quietly replies, forwards or unsubscribes,
// and money and passwords always come straight to you, so those aren't offered.
const QUIET: Action[] = ["MARK_READ", "ARCHIVE", "APPLY_LABEL", "DRAFT_REPLY"];
const ASKED: Action[] = [...QUIET, "SEND_REPLY", "FORWARD", "UNSUBSCRIBE", "ACCEPT_MEETING", "PERMANENTLY_DELETE"];
export const ACTIONS_FOR: Record<Level, Action[]> = {
  PROCEED_SILENTLY: QUIET,
  PROCEED_AND_NOTIFY: ["DRAFT_REPLY", "MARK_READ", "ARCHIVE", "APPLY_LABEL"],
  ASK_FIRST: ASKED,
  ESCALATE: [],
};

/** The action chips, a little plainer than the shared names. */
export const CHIP_NAMES: Partial<Record<Action, string>> = { APPLY_LABEL: "Label it" };
export const chipName = (a: Action) => CHIP_NAMES[a] ?? ACTIONS[a];

export const QUESTION: Record<Level, string> = {
  PROCEED_SILENTLY: "What should I have done with it?",
  PROCEED_AND_NOTIFY: "What should I have done with it?",
  ASK_FIRST: "What should I have asked to do?",
  ESCALATE: "Why should this come to you?",
};

export const REASONS: { reason: Reason; label: string }[] = [
  { reason: "SCAM", label: "Looks like a scam" },
  { reason: "MONEY", label: "Asks for money" },
  { reason: "CREDENTIALS", label: "Asks for a password or code" },
  { reason: "ACCOUNT_SECURITY", label: "About my account's security" },
  { reason: "SENSITIVE_DATA", label: "Has personal info" },
  { reason: "COMMITMENT", label: "Commits me to something" },
  { reason: "PROMPT_INJECTION", label: "Has instructions aimed at Oscar" },
  { reason: "IMPORTANT", label: "It's just important to me" },
];
export const risky = (reasons: Reason[]) => reasons.some((r) => r !== "IMPORTANT");
const ACTED: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"];

/** "Did I understand what this email is?" Missing a risk is only offered for "Asked me first". */
export const WHY: { why: Why; label: string }[] = [
  { why: "preference", label: "Yes, I'd just do it differently" },
  { why: "misread", label: "No, it's actually a…" },
  { why: "risk", label: "You missed that it's risky" },
];

/** Kinds of email, for "it's actually a…". */
export const TYPES = [
  "Promo or marketing",
  "Newsletter",
  "Receipt or order",
  "Job or recruiter",
  "Personal",
  "Work or school",
  "Bill or payment",
  "Account or security",
];

/** An action, "Nothing, I'll handle it" (asks only), or "Something else" (said in the note). */
export type Choice = Action | "NOTHING" | "OTHER";

/**
 * Would Oscar's choice pass this answer? Mirrors expected_answer and grade_answer in oscar/review.py:
 * "only tell me, it's just important" passes asking or stopping it; "ask me, I'll handle it" passes
 * any ask; a quiet "Other" passes nothing, since none of his actions was right.
 */
export function passes(oscar: { autonomy_level: Level; action: Action }, level: Level, choice: Choice | null, reasons: Reason[]) {
  if (level === "ESCALATE" && reasons.length && !risky(reasons)) {
    return oscar.autonomy_level === "ASK_FIRST" || oscar.autonomy_level === "ESCALATE";
  }
  if (oscar.autonomy_level !== level) return false;
  if (level === "ESCALATE") return true;
  if (choice === "OTHER") return false;
  if (choice === "NOTHING" || choice === null) return level === "ASK_FIRST";
  return choice === oscar.action;
}

/** Whether an action still fits a level, so changing only the level keeps it. */
export const fits = (choice: Choice, level: Level) =>
  choice === "OTHER" || (choice === "NOTHING" ? level === "ASK_FIRST" : ACTIONS_FOR[level].includes(choice));

/** A full answer in a few words: "Mark as read, quietly", "Only tell me: asks for money". */
export function describeAnswer(level: Level, action: Action | null, reasons: Reason[] = []): string {
  if (level === "ESCALATE") {
    const why = REASONS.filter((r) => reasons.includes(r.reason)).map((r) => r.label.toLowerCase());
    return `Only tell me${why.length ? `: ${why.join(", ")}` : ""}`;
  }
  if (!action) return level === "ASK_FIRST" ? "Ask me, I'll handle it" : "Something else";
  const how = { PROCEED_SILENTLY: "quietly", PROCEED_AND_NOTIFY: "and tell me", ASK_FIRST: "after asking me" }[level];
  return `${ACTIONS[action]}, ${how}`;
}

export function describeReview(review: Review): string {
  if (review.complete && review.should_be_level) {
    return describeAnswer(review.should_be_level, review.should_be_action, review.reasons);
  }
  const extra = [review.should_be_action && ACTIONS[review.should_be_action], review.actual_type].filter(Boolean);
  return [REVIEW_LABELS[review.label].label, ...extra].join(" · ");
}

/**
 * Your most recent full "No", offered again for emails like it ("No, same as the last one").
 * Not an "Other" (its note was about that email), and not if it's what Oscar already picked here.
 */
export function lastAnswerFor(items: DecisionWithFeedback[], item: DecisionWithFeedback): Review | null {
  const last = items
    .map((i) => i.review)
    .filter((r): r is Review => !!r && r.complete && r.label !== "CORRECT")
    .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0];
  if (!last?.complete || !last.should_be_level || last.decision_id === item.decision.id) return null;
  if (ACTED.includes(last.should_be_level) && !last.should_be_action) return null;
  const choice: Choice | null = last.should_be_action ?? (last.should_be_level === "ASK_FIRST" ? "NOTHING" : null);
  return passes(item.decision, last.should_be_level, choice, last.reasons) ? null : last;
}

/** Your last "No" again, for this email. The note stays behind: it was about that email. */
export const sameAsLast = (decisionId: string, last: Review): ReviewInput => ({
  decision_id: decisionId,
  should_be_level: last.should_be_level!,
  should_be_action: last.should_be_action,
  why: last.why,
  reasons: last.reasons,
  actual_type: last.actual_type,
  label_name: last.label_name,
  note: null,
});
