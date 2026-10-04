// What Today says, worked out from Oscar's real decisions.

import type { Action, DecisionWithFeedback } from "@/lib/api";
import { displayName } from "@/components/kit/sender";
import { plural } from "@/lib/counts";
import { reallyDone } from "@/lib/insights";
import { ACTIONS, wouldOnly } from "@/lib/labels";

const ON_OWN = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);

/** Midnight this morning, by this device's clock. */
export function startOfToday(now: number) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const handledAt = (i: DecisionWithFeedback) => new Date(i.done?.done_at ?? i.decision.created_at).getTime();

// What to call a few emails of one kind, for "Archived 4 promotions".
const NOUNS: Record<string, [string, string]> = {
  marketing: ["promotion", "promotions"],
  promotion: ["promotion", "promotions"],
  newsletter: ["newsletter", "newsletters"],
  job_alert: ["job alert", "job alerts"],
  receipt: ["receipt", "receipts"],
  fyi: ["notice", "notices"],
  account_update: ["notice", "notices"],
  file_share: ["shared file", "shared files"],
  social_notification: ["notification", "notifications"],
};
const noun = (type: string, n: number) => (NOUNS[type] ?? ["email", "emails"])[n === 1 ? 0 : 1];

const GROUP_DID: Partial<Record<Action, (n: number, what: string) => string>> = {
  ARCHIVE: (n, what) => `Archived ${n.toLocaleString()} ${what}`,
  MARK_READ: (n, what) => `Marked ${n.toLocaleString()} ${what} as read`,
  APPLY_LABEL: (n, what) => `Labelled ${n.toLocaleString()} ${what}`,
  DRAFT_REPLY: (n) => `Drafted ${plural(n, "reply", "replies")}`,
};
const GROUP_WOULD: Partial<Record<Action, (n: number, what: string) => string>> = {
  ARCHIVE: (n, what) => `Would archive ${n.toLocaleString()} ${what}`,
  MARK_READ: (n, what) => `Would mark ${n.toLocaleString()} ${what} as read`,
  APPLY_LABEL: (n, what) => `Would label ${n.toLocaleString()} ${what}`,
  DRAFT_REPLY: (n) => `Would draft ${plural(n, "reply", "replies")}`,
};

/** "Nike, Sephora, Aritzia and 2 more": who the emails were from, without repeats. */
export function whoFrom(senders: string[], shown = 3) {
  const names = [...new Set(senders.map((s) => displayName(s)))];
  if (names.length <= shown) return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}

/** One row of what he took care of. id is the email it opens: for a group, the newest one in it. */
export type ActivityRow = { key: string; type: "done" | "reminder"; title: string; detail: string; at: number; id: string };

/**
 * What Oscar took care of since `since`, grouped: "Archived 4 promotions" rather than four rows,
 * newest first. Only what really happened (reallyDone), or, while he only reads Gmail, what he would
 * have done on his own. Reminders from emails he read since then are listed too, unless the email was stopped or flagged.
 */
export function activity(items: DecisionWithFeedback[], since: number, readOnly: boolean): ActivityRow[] {
  const groups = new Map<string, { action: Action; type: string; senders: string[]; at: number; id: string }>();
  for (const i of items) {
    const counted = readOnly ? wouldOnly(i.decision) && ON_OWN.has(i.decision.autonomy_level) : reallyDone(i);
    const at = handledAt(i);
    if (!counted || at < since) continue;
    const type = i.decision.action === "DRAFT_REPLY" ? "" : noun(i.decision.email_type ?? "", 2);
    const key = `${i.decision.action}|${type}`;
    const g = groups.get(key) ?? { action: i.decision.action, type: i.decision.email_type ?? "", senders: [], at: 0, id: "" };
    g.senders.push(i.decision.sender);
    if (at >= g.at) {
      g.at = at;
      g.id = i.decision.id;
    }
    groups.set(key, g);
  }
  const rows: ActivityRow[] = [...groups.entries()].map(([key, g]) => {
    const n = g.senders.length;
    const words = (readOnly ? GROUP_WOULD : GROUP_DID)[g.action];
    const title = words ? words(n, noun(g.type, n)) : `${ACTIONS[g.action]}: ${n.toLocaleString()}`;
    return { key, type: "done", title, detail: `From ${whoFrom(g.senders)}`, at: g.at, id: g.id };
  });
  for (const i of items) {
    const r = i.decision.reminder;
    const at = new Date(i.decision.created_at).getTime();
    if (!r || at < since || i.decision.autonomy_level === "ESCALATE" || i.decision.safety_flags.length) continue;
    rows.push({ key: `reminder|${i.decision.id}`, type: "reminder", id: i.decision.id, title: "Noted something coming up", detail: r.title, at });
  }
  return rows.sort((a, b) => b.at - a.at);
}


