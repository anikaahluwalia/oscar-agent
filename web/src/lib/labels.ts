// Plain-language labels for what the API returns.

import type { Action, Decision, FeedbackKind, Level } from "@/lib/api";

/** What each autonomy level is called in the app. */
export const STATUS: Record<Level, { label: string; pill: string; dot: string }> = {
  PROCEED_SILENTLY: { label: "Handled", pill: "bg-status-handled/10 text-status-handled", dot: "bg-status-handled" },
  PROCEED_AND_NOTIFY: { label: "FYI", pill: "bg-status-fyi/10 text-status-fyi", dot: "bg-status-fyi" },
  ASK_FIRST: { label: "Needs You", pill: "bg-status-needs/10 text-status-needs", dot: "bg-status-needs" },
  ESCALATE: { label: "Blocked", pill: "bg-status-blocked/10 text-status-blocked", dot: "bg-status-blocked" },
};

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

/** One line for what Oscar did with an email: "Archived", "Wants to unsubscribe", "Stopped: move money". */
export function whatOscarDid(decision: Decision): string {
  const { action, autonomy_level: level } = decision;
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
};

export const FEEDBACK: Record<FeedbackKind, string> = {
  APPROVE: "Approved",
  REJECT: "Declined",
  UNDO: "Undone",
  EDIT_THEN_SEND: "Edited and sent",
  ALWAYS_DO_THIS: "Always do this",
  ALWAYS_ASK_ME: "Always ask me",
  SEEN: "Reviewed",
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
