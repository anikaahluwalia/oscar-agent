// Plain-language labels for what the API returns.

import type { Action, Decision, FeedbackKind, Level } from "@/lib/api";

export const LEVELS: Record<Level, { label: string; square: string }> = {
  PROCEED_SILENTLY: { label: "Handled quietly", square: "bg-level-silent" },
  PROCEED_AND_NOTIFY: { label: "Told you", square: "bg-level-notify" },
  ASK_FIRST: { label: "Waiting for your okay", square: "bg-level-ask" },
  ESCALATE: { label: "For you", square: "bg-level-escalate" },
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

export const FLAGS: Record<string, string> = {
  PROMPT_INJECTION: "Instructions aimed at me",
  MONEY: "Money",
  CREDENTIALS: "Passwords or codes",
  ACCOUNT_SECURITY: "Account security",
  SENSITIVE_DATA: "Sensitive data",
  COMMITMENT: "Commits you to something",
};

export const LEVEL_SOURCES: Record<Decision["level_source"], string> = {
  policy: "My default for this kind of action",
  guess: "Nothing matched, so I'm not sure. I ask when I'm guessing",
  learned: "What you've told me before",
  floor: "A safety rule for this action. Feedback can't change it",
  safety_check: "Something in the email looked risky",
};

export const FEEDBACK: Record<FeedbackKind, string> = {
  APPROVE: "Okay",
  REJECT: "No",
  UNDO: "Undo",
  EDIT_THEN_SEND: "Edited and sent",
  ALWAYS_DO_THIS: "Always do this",
  ALWAYS_ASK_ME: "Always ask me",
};

// Actions you can't swipe yes on, because they're hard to undo or leave your inbox.
// Saying yes to these needs a press and hold.
export const HOLD_TO_CONFIRM: Partial<Record<Action, string>> = {
  PERMANENTLY_DELETE: "Deleted email can't be brought back",
  UNSUBSCRIBE: "Unsubscribing is hard to undo",
  SEND_REPLY: "This goes out under your name",
  FORWARD: "This shares the email with someone else",
  ACCEPT_MEETING: "This commits your time",
};
