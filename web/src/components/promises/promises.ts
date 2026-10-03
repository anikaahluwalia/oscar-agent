// The promises on the Promises page. Each one mirrors oscar/safety.py and oscar/act.py: an action
// floor (ACTION_FLOORS), a check on the email (EMAIL_CHECKS), the backstop for emails that only
// mention something sensitive (CAUTION), or what Oscar can do in Gmail at all (act.CHANGES).

import {
  BanknoteIcon,
  CalendarCheckIcon,
  MailXIcon,
  IdCardIcon,
  KeyRoundIcon,
  MessageSquareWarningIcon,
  ScanSearchIcon,
  SendIcon,
  ShieldAlertIcon,
  SignatureIcon,
  type LucideIcon,
} from "lucide-react";

export type PromiseGroup = "stop" | "ask";
export type OscarPromise = { key: string; group: PromiseGroup; icon: LucideIcon; title: string; line: string };

/** The two kinds of promise: what he stops outright (ESCALATE), and what always waits for your yes (ASK_FIRST). */
export const GROUPS: { group: PromiseGroup; title: string; line: string }[] = [
  { group: "stop", title: "Always stop", line: "I do nothing with these and bring them straight to you." },
  { group: "ask", title: "Always need you", line: "I can help with these, but only once you say yes." },
];

export const PROMISES: OscarPromise[] = [
  {
    // MOVE_MONEY floor, MONEY check: always stopped.
    key: "money",
    group: "stop",
    icon: BanknoteIcon,
    title: "Move money",
    line: "Payments, transfers and gift cards. I stop them and bring them to you.",
  },
  {
    // SEND_CREDENTIALS floor, CREDENTIALS check: always stopped, whoever it's from.
    key: "credentials",
    group: "stop",
    icon: KeyRoundIcon,
    title: "Share a password or code",
    line: "Even if the email looks like it's from your bank.",
  },
  {
    // SENSITIVE_DATA check: stopped.
    key: "personal",
    group: "stop",
    icon: IdCardIcon,
    title: "Hand over personal info",
    line: "ID documents, medical records, bank details.",
  },
  {
    // PROMPT_INJECTION check: stopped, and checked first.
    key: "injection",
    group: "stop",
    icon: MessageSquareWarningIcon,
    title: "Follow instructions hidden in an email",
    line: "Text written to an AI is a warning sign, not a request. I only take instructions from you.",
  },
  {
    // ACCOUNT_SECURITY check: stopped.
    key: "account",
    group: "stop",
    icon: ShieldAlertIcon,
    title: "Deal with a security alert",
    line: "New sign-ins, password resets and changed recovery details. You should see those yourself.",
  },
  {
    // COMMITMENT check: stopped.
    key: "commitment",
    group: "stop",
    icon: SignatureIcon,
    title: "Agree to anything for you",
    line: "Contracts, renewals, quotes and terms are your call.",
  },
  {
    // PERMANENTLY_DELETE and UNSUBSCRIBE floors: ask first. act.py has no code for either.
    key: "delete",
    group: "ask",
    icon: MailXIcon,
    title: "Delete or unsubscribe",
    line: "Deleted email can't be brought back, and unsubscribing is hard to undo.",
  },
  {
    // SEND_REPLY and FORWARD floors: ask first. act.py has no code for either.
    key: "send",
    group: "ask",
    icon: SendIcon,
    title: "Send or forward email",
    line: "It goes out under your name, or shares your email with someone else. In Gmail I only mark read, archive and add my own labels.",
  },
  {
    // ACCEPT_MEETING floor: ask first.
    key: "invites",
    group: "ask",
    icon: CalendarCheckIcon,
    title: "Accept an invite",
    line: "Saying yes to a meeting commits your time.",
  },
  {
    // CAUTION: a mention alone means he asks, never handles it quietly.
    key: "caution",
    group: "ask",
    icon: ScanSearchIcon,
    title: "Quietly handle anything sensitive",
    line: "If an email even mentions a wire transfer, a passport or a contract, I ask you first.",
  },
];
