// Numbers and names for the "What Oscar can do" page, worked out from Oscar's real decisions.
// Nothing here is estimated: a kind with no emails in the period has no numbers at all.

import {
  BanknoteIcon,
  BellIcon,
  BotIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  FilePenIcon,
  ForwardIcon,
  InboxIcon,
  KeyRoundIcon,
  LockIcon,
  MailIcon,
  MailQuestionIcon,
  MegaphoneIcon,
  MessageCircleQuestionIcon,
  NewspaperIcon,
  ReceiptIcon,
  ShieldAlertIcon,
  ShieldXIcon,
  ShoppingBagIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserIcon,
  UsersIcon,
  InfoIcon,
  type LucideIcon,
} from "lucide-react";
import type { Action, DecisionWithFeedback, Level, PermissionRow } from "@/lib/api";
import { kindStats, reallyDone } from "@/lib/insights";
import { KIND_NAMES } from "@/lib/labels";

/** A picture for each kind of email (classifier.TYPES, understand.KINDS and the safety kinds). */
const ICONS: Record<string, LucideIcon> = {
  receipt: ReceiptIcon,
  fyi: InfoIcon,
  newsletter: NewspaperIcon,
  question: MessageCircleQuestionIcon,
  promotion: MegaphoneIcon,
  meeting_invite: CalendarDaysIcon,
  confirmation_request: CircleCheckIcon,
  forward_request: ForwardIcon,
  deletion_request: Trash2Icon,
  money_request: BanknoteIcon,
  credential_request: KeyRoundIcon,
  marketing: ShoppingBagIcon,
  job_alert: BriefcaseIcon,
  social_notification: UsersIcon,
  account_update: BellIcon,
  personal: UserIcon,
  cold_outreach: MailQuestionIcon,
  urgent_issue: TriangleAlertIcon,
  security_alert: ShieldAlertIcon,
  scam: ShieldXIcon,
  commitment: FilePenIcon,
  instructions_for_ai: BotIcon,
  prompt_injection: BotIcon,
  sensitive_request: LockIcon,
  bulk: InboxIcon,
};
export const iconFor = (kind: string): LucideIcon => ICONS[kind] ?? MailIcon;

// Kinds a decision can have that KIND_NAMES doesn't name: the safety kinds (agent.FLAG_TYPES)
// and what the rules use when nothing matched.
const MORE_NAMES: Record<string, string> = {
  prompt_injection: "Instructions aimed at Oscar",
  sensitive_request: "Asks for personal info",
  bulk: "List mail he couldn't name",
  unknown: "Emails he couldn't place",
};
export const nameFor = (kind: string) => KIND_NAMES[kind] ?? MORE_NAMES[kind] ?? kind.replace(/_/g, " ");

export type Period = "7" | "30" | "all";
export const PERIODS: { value: Period; label: string; phrase: string }[] = [
  { value: "7", label: "Last 7 days", phrase: "in the last 7 days" },
  { value: "30", label: "Last 30 days", phrase: "in the last 30 days" },
  { value: "all", label: "All time", phrase: "so far" },
];

export type KindRow = {
  kind: string;
  name: string;
  n: number;
  quiet: number; // Quietly
  told: number; // Tell me
  asked: number; // Ask me
  stopped: number; // Stopped
  onOwn: number; // Quietly + Tell me
  did: number; // real inbox: what he really did in Gmail (reallyDone)
  usual: { action: Action; level: Level } | null; // the action and status he picked most with this kind
  rule: PermissionRow | null; // the starting rule for this kind, if it has one
};

function most<T extends string>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  for (const [v, c] of counts) if (best === null || c > counts.get(best)!) best = v;
  return best;
}

/** One row per kind of email that has emails in `items`, most emails first. */
export function kindRows(items: DecisionWithFeedback[], rules: PermissionRow[] | null): KindRow[] {
  return kindStats(items).map((s) => {
    const mine = items.filter((i) => (i.decision.email_type ?? "unknown") === s.kind);
    // The action and status he paired most often, kept together so the pill matches the action.
    const pair = most(mine.map((i) => `${i.decision.action}|${i.decision.autonomy_level}`));
    const [action, level] = pair ? (pair.split("|") as [Action, Level]) : [null, null];
    return {
      kind: s.kind,
      name: nameFor(s.kind),
      n: s.n,
      quiet: mine.filter((i) => i.decision.autonomy_level === "PROCEED_SILENTLY").length,
      told: mine.filter((i) => i.decision.autonomy_level === "PROCEED_AND_NOTIFY").length,
      asked: s.asked,
      stopped: s.stopped,
      onOwn: s.onOwn,
      did: mine.filter((i) => i.decision.source === "gmail" && reallyDone(i)).length,
      usual: action && level ? { action, level } : null,
      rule: rules?.find((r) => r.email_type === s.kind) ?? null,
    };
  });
}

/** How many emails of each status, for the ladder. */
export function levelCounts(items: DecisionWithFeedback[]): Record<Level, number> {
  const out: Record<Level, number> = { PROCEED_SILENTLY: 0, PROCEED_AND_NOTIFY: 0, ASK_FIRST: 0, ESCALATE: 0 };
  for (const i of items) out[i.decision.autonomy_level]++;
  return out;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
