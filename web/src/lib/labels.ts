// Plain-language labels for what the API returns.

import type { Action, ActionDone, Decision, DecisionWithFeedback, FeedbackKind, Level, Review, ReviewLabel } from "@/lib/api";

/** What each autonomy level is called in the app. */
export const STATUS: Record<Level, { label: string; would: string; pill: string; dot: string }> = {
  PROCEED_SILENTLY: { label: "Quietly", would: "Quietly", pill: "bg-status-handled/10 text-status-handled", dot: "bg-status-handled" },
  PROCEED_AND_NOTIFY: { label: "Tell me", would: "Tell me", pill: "bg-status-fyi/10 text-status-fyi", dot: "bg-status-fyi" },
  ASK_FIRST: { label: "Ask me", would: "Ask me", pill: "bg-status-needs/10 text-status-needs", dot: "bg-status-needs" },
  ESCALATE: { label: "Stopped", would: "Stopped", pill: "bg-status-blocked/10 text-status-blocked", dot: "bg-status-blocked" },
};

/** What a status is called. On the real inbox (read-only) it's what Oscar would do. */
export const statusLabel = (level: Level, readOnly = false) => (readOnly ? STATUS[level].would : STATUS[level].label);

export const ACTIONS: Record<Action, string> = {
  MARK_READ: "Mark as read",
  ARCHIVE: "Archive",
  APPLY_LABEL: "Label",
  DRAFT_REPLY: "Draft a reply",
  SEND_REPLY: "Send a reply",
  FORWARD: "Forward",
  UNSUBSCRIBE: "Unsubscribe",
  ACCEPT_MEETING: "Accept invite",
  PERMANENTLY_DELETE: "Delete for good",
  SEND_CREDENTIALS: "Send credentials",
  MOVE_MONEY: "Move money",
};

const DONE: Record<Action, string> = {
  MARK_READ: "Marked as read",
  ARCHIVE: "Archived",
  APPLY_LABEL: "Labelled",
  DRAFT_REPLY: "Drafted a reply",
  SEND_REPLY: "Sent a reply",
  FORWARD: "Forwarded",
  UNSUBSCRIBE: "Unsubscribed",
  ACCEPT_MEETING: "Accepted the invite",
  PERMANENTLY_DELETE: "Deleted for good",
  SEND_CREDENTIALS: "Sent credentials",
  MOVE_MONEY: "Moved money",
};

/** The only things Oscar does in Gmail (oscar/act.py). Mirrors CHANGES. */
export const DOABLE = new Set<Action>(["MARK_READ", "ARCHIVE", "APPLY_LABEL"]);

/**
 * A decision on the real inbox that's only ever what Oscar would do: made while he only read it,
 * or an action he doesn't do in Gmail (a reply, an invite, unsubscribing). Stops are the exception:
 * those you mark as seen.
 */
export const wouldOnly = (decision: Decision) =>
  decision.source === "gmail" &&
  (!decision.acting || (!DOABLE.has(decision.action) && decision.autonomy_level !== "ESCALATE"));

/**
 * One line for what Oscar did with an email: "Archived", "Wants to unsubscribe", "Stopped: move money".
 * On the real inbox it only says he did something if Gmail says he did (done).
 */
export function whatOscarDid(decision: Decision, done?: ActionDone | null): string {
  const { action, autonomy_level: level } = decision;
  if (decision.source === "gmail" && decision.acting && (level === "PROCEED_SILENTLY" || level === "PROCEED_AND_NOTIFY")) {
    if (!done) return `Would ${ACTIONS[action].toLowerCase()}`; // decided, but not something he does in Gmail
    return done.undone_at ? `Undone: ${ACTIONS[action].toLowerCase()}` : DONE[action];
  }
  // An ask you approved: once Gmail says it was done, it's done.
  if (decision.source === "gmail" && decision.acting && level === "ASK_FIRST" && done) {
    return done.undone_at ? `Undone: ${ACTIONS[action].toLowerCase()}` : DONE[action];
  }
  // Made while Oscar only read the inbox: what he would have done.
  if (wouldOnly(decision)) {
    if (level === "ASK_FIRST") return `Would ask to ${ACTIONS[action].toLowerCase()}`;
    if (level === "ESCALATE") return `Would stop: ${ACTIONS[action].toLowerCase()}`;
    return `Would ${ACTIONS[action].toLowerCase()}`;
  }
  if (level === "ASK_FIRST") return `Wants to ${ACTIONS[action].toLowerCase()}`;
  if (level === "ESCALATE") return `Stopped: ${ACTIONS[action].toLowerCase()}`;
  return DONE[action];
}

/** Replies get an editor, and "don't send" instead of "decline". */
export const REPLIES = new Set<Action>(["DRAFT_REPLY", "SEND_REPLY"]);

export const FLAGS: Record<string, string> = {
  PROMPT_INJECTION: "Has instructions aimed at Oscar",
  MONEY: "Asks for money",
  CREDENTIALS: "Asks for a password or code",
  ACCOUNT_SECURITY: "About your account's security",
  SENSITIVE_DATA: "Has sensitive personal info",
  COMMITMENT: "Replying would commit you to something",
};

export const LEVEL_SOURCES: Record<Decision["level_source"], string> = {
  policy: "My default for this kind of action",
  guess: "Nothing matched, so I asked instead of guessing",
  learned: "What you've taught me",
  floor: "A protected rule",
  safety_check: "Something in the email looked risky",
  caution: "It mentions something sensitive, so I checked with you",
  model_check: "Reading it closely, it looked risky",
};

export const FEEDBACK: Record<FeedbackKind, string> = {
  APPROVE: "Approved",
  REJECT: "Declined",
  UNDO: "Undone",
  EDIT_THEN_SEND: "Edited and sent",
  ALWAYS_DO_THIS: "Always do this",
  ALWAYS_ASK_ME: "Always ask me",
  SEEN: "Reviewed",
  FORGET: "Forgot",
};

/** Review labels for the real-inbox review (Stage 9), with what each one means. Mirrors oscar/review.py. */
export const REVIEW_LABELS: Record<ReviewLabel, { label: string; meaning: string }> = {
  CORRECT: { label: "Correct", meaning: "Right action and right level." },
  QUESTIONED_TOO_MUCH: { label: "Questioned too much", meaning: "Too cautious. Should have done more on his own." },
  NEEDED_TO_ASK: { label: "Needed to ask", meaning: "Too permissive. Should have asked first." },
  MISINTERPRETED_RISK: { label: "Misinterpreted risk", meaning: "Got the risk of the email wrong." },
  UNNECESSARY_FLAGGING: { label: "Unnecessary flagging", meaning: "Stopped or flagged something harmless." },
  INCORRECT_ACTION: { label: "Incorrect action", meaning: "The level may be fine, but the action was wrong." },
  INCORRECT_TYPE: { label: "Incorrect type", meaning: "Wrong kind of email, like a recruiter email read as a newsletter." },
  OTHER: { label: "Something else", meaning: "Wrong in another way. Say how." },
  SKIP: { label: "Skip", meaning: "Not sure, or don't count this one." },
};

// Mirrors ACTION_FLOORS in oscar/safety.py. Learning can never lower these.
const NEVER: Partial<Record<Action, string>> = {
  MOVE_MONEY: "I don't touch money",
  SEND_CREDENTIALS: "I don't share passwords or login details",
};
// Actions you can't approve with one tap, because they're hard to undo or leave your inbox.
export const HOLD_TO_CONFIRM: Partial<Record<Action, string>> = {
  PERMANENTLY_DELETE: "Deleted email can't be brought back",
  UNSUBSCRIBE: "Unsubscribing is hard to undo",
  SEND_REPLY: "This goes out under your name",
  FORWARD: "This shares the email with someone else",
  ACCEPT_MEETING: "This commits your time",
};

const UNDOABLE = new Set<Action>(["MARK_READ", "ARCHIVE", "APPLY_LABEL", "DRAFT_REPLY"]);

/** Facts for the Why panel. Worked out from the protected rules, not from the model. */
export function riskOf(decision: Decision): { risk: "Low" | "Medium" | "High"; reversible: boolean } {
  const { action } = decision;
  if (NEVER[action] || decision.safety_flags.length) return { risk: "High", reversible: UNDOABLE.has(action) };
  if (HOLD_TO_CONFIRM[action]) return { risk: "Medium", reversible: false };
  return { risk: "Low", reversible: UNDOABLE.has(action) };
}

export type ProtectedRule = { title: string; rule: string; why: string; kind: "never" | "ask" };

/** The rules Oscar keeps no matter what he learns (oscar/safety.py). */
export const PROTECTED_RULES: ProtectedRule[] = [
  { title: "Money", rule: "Never acts on his own", why: "Payments, wires and transfers always come to you.", kind: "never" },
  { title: "Credentials", rule: "Never sends them", why: "Passwords, codes and login details always come to you.", kind: "never" },
  {
    title: "Suspicious emails",
    rule: "Stops and brings them to you",
    why: "Instructions aimed at Oscar, account security, or requests for sensitive data.",
    kind: "never",
  },
  { title: "Irreversible actions", rule: "Always asks first", why: "Deleting for good and unsubscribing can't be taken back.", kind: "ask" },
  { title: "Anything in your name", rule: "Always asks first", why: "Sending replies, forwarding, and accepting invites.", kind: "ask" },
];

/** Reviews from before the full answer: a "No" that saved only half of it, still to finish. */
export const isOldWay = (review: Review | null) =>
  !!review && !review.complete && review.label !== "CORRECT" && review.label !== "SKIP";

/** Real-inbox decisions not graded yet: not reviewed, or only half-answered. */
export const toGrade = (i: DecisionWithFeedback) => i.decision.source === "gmail" && (!i.review || isOldWay(i.review));

/** While Oscar only reads your inbox, checking his calls is what's waiting on you. Once he acts, his asks are. */
export const needsReview = (i: DecisionWithFeedback) => toGrade(i) && !i.decision.acting;

/** What each kind of email (classifier.TYPES) is called in Settings. */
export const KIND_NAMES: Record<string, string> = {
  receipt: "Receipts and orders",
  fyi: "FYIs, nothing to do",
  newsletter: "Newsletters and promos",
  question: "Questions from people",
  promotion: "Mail you might unsubscribe from",
  meeting_invite: "Meeting invites",
  confirmation_request: "Asks you to confirm something",
  forward_request: "Asks you to forward something",
  deletion_request: "Asks you to delete something",
  money_request: "Asks for money",
  credential_request: "Asks for a password or code",
  // What the model can read an email as (oscar/understand.py).
  marketing: "Marketing",
  job_alert: "Job alert",
  social_notification: "Social notification",
  account_update: "Account update",
  personal: "A personal note",
  cold_outreach: "A cold sales pitch",
  urgent_issue: "Something urgent",
  security_alert: "Security alert",
  scam: "Looks like a scam",
  commitment: "Would commit you to something",
  instructions_for_ai: "Instructions aimed at an AI",
};
