// The promises on the Promises page. Each one mirrors oscar/safety.py and oscar/act.py: an action
// floor (ACTION_FLOORS), a check on the email (EMAIL_CHECKS), the backstop for emails that only
// mention something sensitive (CAUTION), or what Oscar can do in Gmail at all (act.CHANGES).

import {
  BanknoteIcon,
  IdCardIcon,
  KeyRoundIcon,
  MessageSquareWarningIcon,
  ScanSearchIcon,
  SendIcon,
  ShieldAlertIcon,
  SignatureIcon,
  type LucideIcon,
} from "lucide-react";

export type OscarPromise = { key: string; icon: LucideIcon; title: string; line: string };

export const PROMISES: OscarPromise[] = [
  {
    // MOVE_MONEY floor, MONEY check: always stopped.
    key: "money",
    icon: BanknoteIcon,
    title: "Move money",
    line: "Payments, transfers and gift cards. I stop them and bring them to you.",
  },
  {
    // SEND_CREDENTIALS floor, CREDENTIALS check: always stopped, whoever it's from.
    key: "credentials",
    icon: KeyRoundIcon,
    title: "Share a password or code",
    line: "Even if the email looks like it's from your bank.",
  },
  {
    // act.py: the only Gmail changes are mark read, archive and Oscar's own labels.
    // Sending, forwarding, deleting and unsubscribing always ask first.
    key: "send",
    icon: SendIcon,
    title: "Send, forward or delete email",
    line: "I never send, forward, delete or unsubscribe in your Gmail. I only mark read, archive and add my own labels.",
  },
  {
    // COMMITMENT check: stopped. ACCEPT_MEETING floor: asks first.
    key: "commitment",
    icon: SignatureIcon,
    title: "Agree to anything for you",
    line: "Contracts, renewals, quotes and terms are your call. So is saying yes to a meeting.",
  },
  {
    // SENSITIVE_DATA check: stopped.
    key: "personal",
    icon: IdCardIcon,
    title: "Hand over personal info",
    line: "ID documents, medical records, bank details.",
  },
  {
    // PROMPT_INJECTION check: stopped, and checked first.
    key: "injection",
    icon: MessageSquareWarningIcon,
    title: "Follow instructions hidden in an email",
    line: "Text written to an AI is a warning sign, not a request. I only take instructions from you.",
  },
  {
    // ACCOUNT_SECURITY check: stopped.
    key: "account",
    icon: ShieldAlertIcon,
    title: "Deal with a security alert",
    line: "New sign-ins, password resets and changed recovery details. You should see those yourself.",
  },
  {
    // CAUTION: a mention alone means he asks, never handles it quietly.
    key: "caution",
    icon: ScanSearchIcon,
    title: "Quietly handle anything sensitive",
    line: "If an email even mentions a wire transfer, a passport or a contract, I ask you first.",
  },
];
