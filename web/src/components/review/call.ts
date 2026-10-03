// Oscar's call on one email, in his words. It only says he did something if he really did:
// on the real inbox, if Gmail says so (item.done); while he only reads it, what he would do.

import type { Action, DecisionWithFeedback } from "@/lib/api";
import { timeOf } from "@/lib/insights";
import { DOABLE, KIND_NAMES, REPLIES, wouldOnly } from "@/lib/labels";

// Mirrors ACTION_PHRASES and ACTION_DONE in oscar/voice.py.
const PHRASE: Record<Action, string> = {
  MARK_READ: "mark this as read",
  ARCHIVE: "archive this",
  APPLY_LABEL: "label this",
  DRAFT_REPLY: "draft a reply",
  SEND_REPLY: "send a reply",
  FORWARD: "forward this",
  UNSUBSCRIBE: "unsubscribe you",
  ACCEPT_MEETING: "accept this invite",
  PERMANENTLY_DELETE: "permanently delete this",
  SEND_CREDENTIALS: "send your credentials",
  MOVE_MONEY: "move money",
};
const DONE: Record<Action, string> = {
  MARK_READ: "marked this as read",
  ARCHIVE: "archived this",
  APPLY_LABEL: "labelled this",
  DRAFT_REPLY: "drafted a reply",
  SEND_REPLY: "sent a reply",
  FORWARD: "forwarded this",
  UNSUBSCRIBE: "unsubscribed you",
  ACCEPT_MEETING: "accepted this invite",
  PERMANENTLY_DELETE: "permanently deleted this",
  SEND_CREDENTIALS: "sent your credentials",
  MOVE_MONEY: "moved money",
};

const said = (i: DecisionWithFeedback, kind: string) => i.feedback.some((f) => f.kind === kind);

/** "I'd mark this as read without asking.", "I stopped this and brought it to you." */
export function callLine(item: DecisionWithFeedback): string {
  const { decision: d, done } = item;
  const real = d.source === "gmail";
  const would = wouldOnly(d);
  const phrase = PHRASE[d.action];
  const past = DONE[d.action];

  if (d.autonomy_level === "ESCALATE") {
    if (would) return "I'd stop this and bring it to you, without doing anything.";
    return said(item, "SEEN") ? "I stopped this and brought it to you, and you've seen it." : "I stopped this and brought it to you. Nothing was done.";
  }

  if (d.autonomy_level === "ASK_FIRST") {
    if (would) return `I'd ask you before I ${phrase}.`;
    if (real && done) return done.undone_at ? `You said yes and I ${past}, then it was undone.` : `You said yes, so I ${past}.`;
    if (said(item, "APPROVE")) return real ? "You said yes." : `You said yes, so I ${past}.`;
    if (said(item, "REJECT")) return "You said no, so I left it alone.";
    return `I'm asking before I ${phrase}.`;
  }

  const how = d.autonomy_level === "PROCEED_SILENTLY" ? "without asking" : "and let you know";
  if (real) {
    // Only what Gmail says he did. Anything else is what he would have done.
    if (done && DOABLE.has(d.action)) return done.undone_at ? `I ${past}, and it was undone.` : `I ${past} ${how}.`;
    return `I'd ${phrase} ${how}.`;
  }
  return said(item, "UNDO") ? `I ${past}, and you undid it.` : `I ${past} ${how}.`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The reason from his explanation (oscar/voice.py: "...since {reason}.", "...because {reason}.",
 * or "I stopped this one. It looks like..."), else his last working note, plus what he noticed.
 */
export function becauseOf(item: DecisionWithFeedback): string | null {
  const d = item.decision;
  const text = d.message || d.explanation;
  let reason = text.match(/\b(?:since|because) (.+?)\.(?:\s|$)/)?.[1];
  if (!reason && /^I stopped this one\. /.test(text)) reason = lower(text.replace(/^I stopped this one\. /, "").replace(/\.$/, ""));
  if (!reason) {
    const note = d.steps.slice(1, -1).filter((s) => !s.startsWith("Noticed ")).at(-1);
    if (note) reason = lower(note.replace(/^Checked my [^:]+: /, ""));
  }
  const noticed = d.noticed ? `I noticed “${d.noticed}”.` : null;
  if (!reason) return noticed;
  return `${reason}.${noticed ? ` ${noticed}` : ""}`;
}

/** The honest small print: no drafts, nothing changed in Gmail. */
export function smallPrint(item: DecisionWithFeedback): string | null {
  const d = item.decision;
  const real = d.source === "gmail";
  if (REPLIES.has(d.action)) {
    return real
      ? "I don't write or send replies, so there's no draft. If it needs an answer, reply in Gmail yourself."
      : "This is an example, so there's no draft to show. On your real inbox I never write or send replies.";
  }
  if (real && !d.acting) return "I was only reading your inbox then, so nothing changed in Gmail.";
  if (real && !DOABLE.has(d.action) && d.autonomy_level !== "ESCALATE") return "This isn't something I do in Gmail, so nothing changed there.";
  return null;
}

/** The kind of email he took it for, when he knows. */
export function kindOf(item: DecisionWithFeedback): string | null {
  const kind = item.decision.email_type;
  if (!kind || kind === "unknown" || kind === "bulk") return null;
  return KIND_NAMES[kind] ?? kind.replace(/_/g, " ");
}

/** How many emails Oscar has from this sender from before this one. */
export function fromBefore(items: DecisionWithFeedback[], item: DecisionWithFeedback): number {
  const at = timeOf(item);
  return items.filter((i) => i.decision.sender === item.decision.sender && i.decision.id !== item.decision.id && timeOf(i) < at).length;
}
