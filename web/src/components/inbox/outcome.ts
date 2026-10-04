// What really happened with one email, for the Inbox. Worked out only from the decision,
// what Gmail says Oscar did (done) and your answers. It never says he did something he didn't.

import type { Action, ActionDone, Decision, DecisionWithFeedback, FeedbackEvent } from "@/lib/api";
import { ACTIONS, confused, DOABLE, inGmail, isSafetyStop, LEVEL_SOURCES, whatOscarDid, wouldOnly } from "@/lib/labels";
import { dayLabel, formatTime } from "@/lib/time";

/** "Today, 9:32 AM". */
export const when = (iso: string) => `${dayLabel(iso)}, ${formatTime(iso)}`;

const ACTED = new Set(["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY"]);
const lower = (d: Decision) => ACTIONS[d.action].toLowerCase();

/** Undone, in Gmail (its record, real or the demo's pretend one) or on the old example inbox (your Undo). */
export function isUndone(decision: Decision, done: ActionDone | null | undefined, feedback: FeedbackEvent[] = []) {
  return inGmail(decision) ? !!done?.undone_at : feedback.some((f) => f.kind === "UNDO");
}

/**
 * Whether Oscar really did it and it still stands. In Gmail (real, or the demo's pretend one): Gmail
 * has a record and it wasn't undone (like reallyDone). The old example inbox: he acted on his own,
 * it's something he can do, and you didn't undo it.
 */
export function didIt(decision: Decision, done: ActionDone | null | undefined, feedback: FeedbackEvent[] = []) {
  if (inGmail(decision)) return !!done && !done.undone_at && DOABLE.has(decision.action);
  return ACTED.has(decision.autonomy_level) && DOABLE.has(decision.action) && !isUndone(decision, done, feedback);
}

/**
 * Oscar's message and notes are written as he decides, before Gmail. Read-only ones say "I'd...".
 * Otherwise an action he took on his own says "I archived this" whether or not it happened, and
 * a reply reads "I drafted a reply for you" though he never writes one. True when that would mislead.
 */
export function notesOverclaim(decision: Decision, done: ActionDone | null | undefined, feedback: FeedbackEvent[] = []) {
  const readOnly = decision.source === "gmail" && !decision.acting;
  return ACTED.has(decision.autonomy_level) && !readOnly && !didIt(decision, done, feedback);
}

const answered = (feedback: FeedbackEvent[], ...kinds: FeedbackEvent["kind"][]) => feedback.some((f) => kinds.includes(f.kind));

/**
 * One line for the log. Mostly whatOscarDid, with three corrections so the line never claims more
 * than happened: an ask you approved that Gmail shows as done says so, an undone demo action says
 * so, and in the demo a reply he'd only suggest reads "Would draft a reply", not "Drafted a reply".
 */
export function didLine(decision: Decision, done: ActionDone | null | undefined, feedback: FeedbackEvent[] = []) {
  const level = decision.autonomy_level;
  if (level === "ASK_FIRST" && done) {
    // whatOscarDid only words his own actions; this one you approved, and Gmail shows it done.
    return done.undone_at ? `Undone: ${lower(decision)}` : `${whatOscarDid({ ...decision, autonomy_level: "PROCEED_SILENTLY" }, done)}, after you approved`;
  }
  if (decision.source === "gmail") {
    if (level === "ASK_FIRST" && !wouldOnly(decision) && answered(feedback, "REJECT")) return `You declined: ${lower(decision)}`;
    return whatOscarDid(decision, done);
  }
  if (ACTED.has(level)) {
    if (!DOABLE.has(decision.action)) return `Would ${lower(decision)}`;
    if (isUndone(decision, done, feedback)) return `Undone: ${lower(decision)}`;
  }
  if (level === "ASK_FIRST") {
    if (answered(feedback, "REJECT")) return `You declined: ${lower(decision)}`;
    if (answered(feedback, "APPROVE", "EDIT_THEN_SEND")) return `You approved: ${lower(decision)}`;
  }
  return whatOscarDid(decision, done);
}

/** The Gmail label "Label it" uses for this email, by the name you gave it in Settings. The API works
 * it out (oscar/labels.py), so a rename shows up here straight away. */
export const labelName = (item: DecisionWithFeedback) => item.label ?? "Sorted";

export type Outcome = { tone: "done" | "undone" | "waiting" | "stopped" | "nothing"; text: string };

/** What came of Oscar's decision, in plain words (his, for the note). */
export function outcomeOf(item: DecisionWithFeedback): Outcome {
  const { decision: d, done, feedback } = item;
  const level = d.autonomy_level;
  const action = lower(d);

  if (done) {
    // What Gmail says he did (after a No in Review, what he did instead), real or the demo's pretend one.
    const fixed = done.by === "you" && !!item.review?.complete && item.review.label !== "CORRECT";
    const how = done.by === "oscar" ? "on my own" : fixed ? "as you said in Review" : "after you approved it";
    const where = d.source === "gmail" ? "in Gmail" : "in the demo inbox";
    const what =
      done.action === "APPLY_LABEL" ? `Added the "${labelName(item)}" label ${where}`
      : done.action === "DRAFT_REPLY" ? `Saved a draft reply ${where}, not sent,`
      : `Done ${where} (${ACTIONS[done.action].toLowerCase()})`;
    if (done.undone_at) {
      return { tone: "undone", text: `${what} ${how}, ${when(done.done_at)}. Undone ${when(done.undone_at)}, so it's back the way it was.` };
    }
    return { tone: "done", text: `${what} ${how}, ${when(done.done_at)}.` };
  }

  if (d.source === "gmail") {
    if (wouldOnly(d)) {
      if (!d.acting) return { tone: "nothing", text: "Nothing changed in Gmail. I was only reading your inbox when this came in." };
      return { tone: "nothing", text: `Nothing changed in Gmail. I don't ${action} in Gmail, so this is only what I would do.` };
    }
    if (level === "ESCALATE") {
      return isSafetyStop(d)
        ? { tone: "stopped", text: "I stopped here. Nothing was done in Gmail." }
        : { tone: "waiting", text: "It's yours to deal with. Nothing was done in Gmail." };
    }
    if (level === "ASK_FIRST") {
      if (answered(feedback, "REJECT")) return { tone: "nothing", text: "You declined, so nothing changed in Gmail." };
      if (answered(feedback, "APPROVE")) return { tone: "nothing", text: "You approved it, but Gmail doesn't show it as done, so nothing changed." };
      return { tone: "waiting", text: "Waiting for your okay. Nothing changes in Gmail until you approve." };
    }
    return { tone: "nothing", text: "Gmail doesn't show this as done, so nothing changed." };
  }

  // The demo: example emails, in its own pretend Gmail (or, on the old example inbox, in none).
  if (level === "ESCALATE") return { tone: "stopped", text: "I stopped here. Nothing was done." };
  if (level === "ASK_FIRST") {
    if (answered(feedback, "REJECT")) return { tone: "nothing", text: "You declined, so I left it alone." };
    if (answered(feedback, "APPROVE", "EDIT_THEN_SEND")) return { tone: "done", text: "You approved it in the demo inbox." };
    return { tone: "waiting", text: "Waiting for your okay." };
  }
  if (!DOABLE.has(d.action)) {
    return { tone: "nothing", text: `Nothing was written or sent. I don't ${action} myself, so this is only what I would do.` };
  }
  if (inGmail(d)) {
    return d.action === "DRAFT_REPLY"
      ? { tone: "nothing", text: "I don't have a draft written for this one, so there's no draft. It's yours to answer." }
      : { tone: "nothing", text: "Nothing changed in the demo inbox." };
  }
  if (isUndone(d, done, feedback)) return { tone: "undone", text: "Done in the demo inbox, then you undid it." };
  return { tone: "done", text: `Done in the demo inbox, ${when(d.created_at)}.` };
}

// Mirrors ACTION_PHRASES and ACTION_DONE in oscar/voice.py, so his note sounds like him.
const PHRASE: Record<Action, string> = {
  MARK_READ: "mark this as read",
  ARCHIVE: "archive this",
  APPLY_LABEL: "label this",
  DRAFT_REPLY: "draft a reply",
  SEND_REPLY: "send a reply",
  FORWARD: "forward this",
  UNSUBSCRIBE: "unsubscribe you",
  ACCEPT_MEETING: "accept this invite",
  PERMANENTLY_DELETE: "move this to the Trash",
  SEND_CREDENTIALS: "send your credentials",
  MOVE_MONEY: "move money",
};
const PAST: Record<Action, string> = {
  MARK_READ: "marked this as read",
  ARCHIVE: "archived this",
  APPLY_LABEL: "labelled this",
  DRAFT_REPLY: "drafted a reply for you",
  SEND_REPLY: "sent a reply",
  FORWARD: "forwarded this",
  UNSUBSCRIBE: "unsubscribed you",
  ACCEPT_MEETING: "accepted this invite",
  PERMANENTLY_DELETE: "moved this to the Trash",
  SEND_CREDENTIALS: "sent your credentials",
  MOVE_MONEY: "moved money",
};

/** What he'd do and what he did, in his words, naming the label when it's "Label it":
 * 'add the "Receipts" label', 'added the "Receipts" label'. */
const phraseOf = (i: DecisionWithFeedback) => (i.decision.action === "APPLY_LABEL" ? `add the "${labelName(i)}" label` : PHRASE[i.decision.action]);
/** What he did: Gmail's record when there is one (after a No in Review, what he did instead). */
const past = (i: DecisionWithFeedback) => {
  const action = i.done?.action ?? i.decision.action;
  return action === "APPLY_LABEL" ? `added the "${labelName(i)}" label` : PAST[action];
};

/**
 * Oscar's one bold line about an email, in his words. Like didLine, it only says he did something
 * when he really did (didIt, or Gmail's record of an ask you approved); otherwise it's what he would do.
 */
export function noteLine(item: DecisionWithFeedback): string {
  const { decision: d, done, feedback } = item;
  const level = d.autonomy_level;
  const phrase = phraseOf(item);

  if (wouldOnly(d)) {
    if (level === "ESCALATE") return isSafetyStop(d) ? "I'd hold this one back." : "I'd bring this one to you.";
    if (confused(d)) return "I wasn't sure what to do with this one, so I'd ask you.";
    if (level === "ASK_FIRST") return `I'd ask you before I ${phrase}.`;
    return level === "PROCEED_AND_NOTIFY" ? `I'd ${phrase} and tell you.` : `I'd ${phrase}.`;
  }
  if (level === "ESCALATE") return isSafetyStop(d) ? "I held this one back." : "This one's for you, so I left it alone.";
  if (level === "ASK_FIRST") {
    if (done) return done.undone_at ? `You said yes and I ${past(item)}, then it was undone.` : `You said yes, so I ${past(item)}.`;
    if (answered(feedback, "REJECT")) return "You said no, so I left it alone.";
    if (answered(feedback, "APPROVE", "EDIT_THEN_SEND")) {
      return d.source === "gmail" ? "You said yes, but Gmail doesn't show it done." : "You said yes.";
    }
    return confused(d) ? "I'm not sure what to do with this one. Can you tell me what you'd like?" : `Want me to ${phrase}?`;
  }
  // After a No in Review, what you said to do instead.
  if (done && done.by === "you" && !done.undone_at) return `You said to ${PHRASE[done.action]}, so I did.`;
  if (didIt(d, done, feedback)) return level === "PROCEED_AND_NOTIFY" ? `I ${past(item)}, and I'm letting you know.` : `I ${past(item)}.`;
  if (isUndone(d, done, feedback)) return inGmail(d) ? `I ${past(item)}, and it's been undone.` : `I ${past(item)}, then you undid it.`;
  if (!DOABLE.has(d.action)) return `I'd ${phrase}.`; // the line under it says he doesn't do it himself
  return d.source === "gmail" ? `I was going to ${phrase}, but Gmail doesn't show it done.` : `I'd ${phrase}.`;
}

const sentence = (text: string) => {
  const t = text.trim().replace(/[.\s]+$/, "");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : "";
};

/**
 * The "because" part of his note, from what he said when he decided (oscar/voice.py):
 * "...because it's hard to undo." becomes "It's hard to undo." Only the reason is kept, never the
 * part that says what he did, since that was written before anything happened.
 */
export function becauseOf(d: Decision): string {
  const said = d.message || d.explanation.replace(/\s*\((I noticed|Nothing in it stood out)[^)]*\)\s*$/, "");
  const stopped = said.match(/^I stopped this one\.\s*([^]+)$/);
  if (stopped) return sentence(stopped[1]);
  const reason = said.match(/\b(?:because|since)\s+([^]+)$/);
  if (reason) return sentence(reason[1]);
  return sentence(LEVEL_SOURCES[d.level_source]);
}
