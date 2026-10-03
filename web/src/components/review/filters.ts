// The tabs along the top of Review, and the order emails are shown in. Every count is worked
// out from Oscar's real decisions.

import type { DecisionWithFeedback, FeedbackKind, Level } from "@/lib/api";
import { reallyDone, timeOf } from "@/lib/insights";
import { ACTIONS, DOABLE, isOldWay, needsReview, toGrade, whatOscarDid, wouldOnly } from "@/lib/labels";
import { isOpen } from "@/lib/use-oscar";

export type FilterKey = "needs" | "check" | "all" | "done" | "stopped" | "finish";

export type Filter = {
  key: FilterKey;
  label: string;
  match: (i: DecisionWithFeedback) => boolean;
  /** Shown "check these first": what teaches him most at the top, instead of newest first. */
  ranked?: boolean;
  /** Hidden when there's nothing in it (unless it's the one you're on). */
  optional?: boolean;
  empty: string;
};

const ON_HIS_OWN = new Set<Level>(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);

/**
 * Needs you matches the Review badge in the menu: while Oscar only reads your inbox, it's his
 * calls you haven't checked; once he acts, it's what he asked about or stopped.
 */
export function filtersFor({ real, readOnly }: { real: boolean; readOnly: boolean }): Filter[] {
  const all: Filter[] = [
    {
      key: "all",
      label: "All",
      match: () => true,
      empty: "No emails yet.",
    },
    {
      key: "needs",
      label: "Needs you",
      match: readOnly ? needsReview : isOpen,
      ranked: readOnly,
      empty: readOnly ? "All checked! Every call he's made has your answer." : "All caught up! Nothing needs you right now.",
    },
    {
      key: "check",
      label: "Check his calls",
      match: (i) => toGrade(i) && !isOldWay(i.review),
      ranked: true,
      optional: true,
      empty: "All checked! Every call he's made has your answer.",
    },
    readOnly
      ? {
          key: "done",
          label: "He'd do on his own",
          match: (i) => ON_HIS_OWN.has(i.decision.autonomy_level),
          empty: "Nothing he'd do on his own yet.",
        }
      : {
          key: "done",
          label: "Done on his own",
          // On the real inbox, only what Gmail says he did himself (not what you approved).
          match: (i) => ON_HIS_OWN.has(i.decision.autonomy_level) && reallyDone(i) && (!real || i.done?.by === "oscar"),
          empty: "He hasn't done anything on his own yet.",
        },
    {
      key: "stopped",
      label: "Stopped",
      match: (i) => i.decision.autonomy_level === "ESCALATE",
      empty: "Nothing stopped. If an email looks risky, he'll stop and bring it here.",
    },
    {
      key: "finish",
      label: "Finish these",
      match: (i) => isOldWay(i.review),
      optional: true,
      empty: "All finished!",
    },
  ];
  // "Check his calls" is its own tab only once Oscar acts; before that, it's what Needs you is.
  return all.filter((f) => f.key !== "check" || (real && !readOnly));
}

/** Emails from senders Oscar has only had one email from so far. */
export function newSenders(items: DecisionWithFeedback[]): Set<string> {
  const counts = new Map<string, number>();
  items.forEach((i) => counts.set(i.decision.sender, (counts.get(i.decision.sender) ?? 0) + 1));
  return new Set(items.filter((i) => counts.get(i.decision.sender) === 1).map((i) => i.decision.id));
}

/**
 * How much checking this email would teach: what he couldn't read at all first, then what he
 * wasn't sure of, then senders he's never seen, then stops. Old half-answers come last, since you
 * already said he got those wrong.
 */
export function priority(i: DecisionWithFeedback, firstSeen: Set<string>): number {
  const d = i.decision;
  if (isOldWay(i.review)) return 5;
  if (d.level_source === "guess") return 0;
  if ((d.confidence ?? 0) < 0.7) return 1;
  if (firstSeen.has(d.id)) return 2;
  if (d.autonomy_level === "ESCALATE") return 3;
  return 4;
}

/** The list for a tab: newest first, or most useful first for ranked tabs. Stops lead in Needs you. */
export function listFor(items: DecisionWithFeedback[], filter: Filter, firstSeen: Set<string>) {
  const rank = (i: DecisionWithFeedback) =>
    filter.ranked ? priority(i, firstSeen) : filter.key === "needs" && i.decision.autonomy_level === "ESCALATE" ? 0 : 1;
  return items.filter(filter.match).sort((a, b) => rank(a) - rank(b) || timeOf(b).localeCompare(timeOf(a)));
}

const said = (i: DecisionWithFeedback, kind: FeedbackKind) => i.feedback.some((f) => f.kind === kind);

/**
 * One line for what happened with an email. It only says Oscar did something in Gmail if Gmail
 * says he did (item.done), and says when it was you who said yes.
 */
export function outcomeOf(item: DecisionWithFeedback): string {
  const { decision: d, done } = item;
  const action = ACTIONS[d.action].toLowerCase();
  if (d.source === "gmail" && done && DOABLE.has(d.action)) {
    if (done.undone_at) return `Undone: ${action}`;
    // Past tense from the shared labels ("Archived"), whatever level he picked.
    const past = whatOscarDid({ ...d, autonomy_level: "PROCEED_SILENTLY" }, done);
    return done.by === "you" ? `${past} after you said yes` : past;
  }
  if (!wouldOnly(d)) {
    if (d.autonomy_level === "ASK_FIRST" && said(item, "APPROVE")) return d.source === "gmail" ? "You said yes" : `You said yes: ${action}`;
    if (d.autonomy_level === "ASK_FIRST" && said(item, "REJECT")) return "You said no";
    if (d.source !== "gmail" && ON_HIS_OWN.has(d.autonomy_level) && said(item, "UNDO")) return `Undone: ${action}`;
  }
  return whatOscarDid(d, done);
}

/** The sender's name without the address, and the address on its own. */
export function splitSender(sender: string): { name: string; address: string | null } {
  const address = sender.match(/<([^>]+)>/)?.[1] ?? null;
  const name = sender.replace(/<[^>]*>/, "").trim().replace(/^"|"$/g, "") || sender;
  return { name, address: address && address !== name ? address : null };
}
