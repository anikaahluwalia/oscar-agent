// The protections on the Safety page. Each one mirrors oscar/safety.py: an action floor
// (ACTION_FLOORS), a check on the email (EMAIL_CHECKS), or the backstop for emails that only
// mention something sensitive (CAUTION). `matches` says which of Oscar's decisions it covered,
// so the page can count real emails, never estimate them.

import {
  BanknoteIcon,
  IdCardIcon,
  KeyRoundIcon,
  MessageSquareWarningIcon,
  ScanSearchIcon,
  SendIcon,
  ShieldAlertIcon,
  SignatureIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import type { Action, Decision } from "@/lib/api";

export type Protection = {
  key: string;
  icon: LucideIcon;
  title: string;
  line: string;
  /** "stop": always comes to you (ESCALATE). "ask": always asks first (ASK_FIRST). */
  kind: "stop" | "ask";
  matches: (d: Decision) => boolean;
};

const flagged = (flag: string, action?: Action) => (d: Decision) => d.safety_flags.includes(flag) || (!!action && d.action === action);
const doing = (...actions: Action[]) => (d: Decision) => actions.includes(d.action);

export const RULE_LINE: Record<Protection["kind"], string> = {
  stop: "Always comes to you.",
  ask: "Always asks first.",
};

export const PROTECTIONS: Protection[] = [
  {
    key: "money",
    icon: BanknoteIcon,
    title: "Money movement",
    line: "Payments, wires, transfers and gift cards. He never moves money.",
    kind: "stop",
    matches: flagged("MONEY", "MOVE_MONEY"),
  },
  {
    key: "send",
    icon: SendIcon,
    title: "Sending or forwarding",
    line: "He never sends on his own. Replies, forwards and invite answers wait for you.",
    kind: "ask",
    matches: doing("SEND_REPLY", "FORWARD", "ACCEPT_MEETING"),
  },
  {
    key: "delete",
    icon: Trash2Icon,
    title: "Deleting for good or unsubscribing",
    line: "Both are hard to take back, so he leaves them to you.",
    kind: "ask",
    matches: doing("PERMANENTLY_DELETE", "UNSUBSCRIBE"),
  },
  {
    key: "credentials",
    icon: KeyRoundIcon,
    title: "Passwords and codes",
    line: "Passwords, sign-in codes and login details. He never shares them.",
    kind: "stop",
    matches: flagged("CREDENTIALS", "SEND_CREDENTIALS"),
  },
  {
    key: "personal",
    icon: IdCardIcon,
    title: "Personal info",
    line: "ID numbers, bank details and medical records. He never passes them on.",
    kind: "stop",
    matches: flagged("SENSITIVE_DATA"),
  },
  {
    key: "injection",
    icon: MessageSquareWarningIcon,
    title: "Instructions aimed at Oscar",
    line: "Emails that try to tell him what to do. He only takes instructions from you.",
    kind: "stop",
    matches: flagged("PROMPT_INJECTION"),
  },
  {
    key: "commitment",
    icon: SignatureIcon,
    title: "Commitments",
    line: "Contracts, renewals and anything that signs you up. That's your call.",
    kind: "stop",
    matches: flagged("COMMITMENT"),
  },
  {
    key: "account",
    icon: ShieldAlertIcon,
    title: "Account security",
    line: "New sign-ins, password resets and changed recovery details. You should see these yourself.",
    kind: "stop",
    matches: flagged("ACCOUNT_SECURITY"),
  },
  {
    key: "caution",
    icon: ScanSearchIcon,
    title: "Mentions of something sensitive",
    line: "If an email mentions a wire transfer, a passport or a contract, he never handles it alone.",
    kind: "ask",
    matches: (d) => d.level_source === "caution",
  },
];
