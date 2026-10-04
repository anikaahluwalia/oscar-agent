// The demo tour, one step at a time. Each step says which page it's on, what Oscar points at (a
// data-tour="..." on the real element), and what it says. First how Oscar learns, on three emails,
// then a closing card, then the rest of the app: Review and Chat you try for real. Steps that wait
// for you read what really happened from the data: what Oscar does with each email is his own
// call, made the same way as on a real inbox. The tour only finds those emails to point at them.

import type { OscarPose } from "@/components/oscar-mood";
import type { DecisionWithFeedback, FeedbackEvent } from "@/lib/api";
import { askOscar, type ChatMessage } from "@/lib/chat-store";
import { waiting } from "@/lib/counts";
import { checkGmail, resetDemoInbox } from "@/lib/demo";
import { setHash } from "@/lib/use-hash";
import type { OscarData } from "@/lib/use-oscar";

/** Your answers and the chat as they were when a step started, so it can tell what you did on it. */
export type Before = { answers: Set<string>; chat: number };

/**
 * What a step can look at: the app's data, the email open in the Inbox (/inbox#<id>), whether
 * the screen is narrow enough that the Inbox shows the list or the open email, not both (below lg),
 * the chat, and `before`.
 */
export type TourCtx = { data: OscarData; hash: string; narrow: boolean; chat: ChatMessage[]; before: Before };

/** Every answer you've given: on his calls, and in Safety review. */
const answersIn = (data: OscarData) =>
  data.all.flatMap((i) => [
    ...i.feedback.map((f) => ({ id: f.id, kind: f.kind as string })),
    ...(i.safety_review ? [{ id: i.safety_review.id, kind: "SAFETY" }] : []),
  ]);
export const beforeOf = (data: OscarData, chat: ChatMessage[]): Before => ({ answers: new Set(answersIn(data).map((a) => a.id)), chat: chat.length });

/** A value, or one worked out from what's really in the demo right now. */
type Live<T> = T | ((c: TourCtx) => T);
export const live = <T>(v: Live<T>, c: TourCtx): T => (typeof v === "function" ? (v as (c: TourCtx) => T)(c) : v);

/** The page a step is on. `hash` opens one email there ("" for none); left out, the open email stays. */
export type Where = { path: string; hash?: string };

/** Which side of the target Oscar stands on, when there's room. */
export type Side = "right" | "left" | "below" | "above";

/** A button that does something real. It can return the step to go to next. */
export type TourAction = { label: string; run: () => Promise<string | void> };

export type TourStep = {
  id: string;
  title: string;
  pose: Live<OscarPose>;
  text: Live<string>;
  /** What really happened, under what he says: a check mark when it went the way the step is about. */
  outcome?: Live<string | undefined>;
  /** In the middle of the screen, pointing at nothing. */
  centre?: boolean;
  where?: Live<Where | undefined>;
  /** data-tour names, the first one on screen wins. */
  target?: Live<string[]>;
  /** Where Oscar stands when there's room, so he doesn't cover what the step is about. */
  side?: Side;
  /** data-tour names he stays off when he can, like the question around the button he points at. */
  clear?: string[];
  /** For steps you do yourself: Next waits until this is true. `advance` moves on by itself once it is. */
  waitFor?: { done: (c: TourCtx) => boolean; hint: Live<string>; advance?: boolean };
  action?: Live<TourAction | undefined>;
  /** Show the four levels, each with its colour. */
  levels?: boolean;
};

// The demo emails the tour points to (emails/demo). Evergreen is there from the start; Trailhead
// and Sunday Home come in later (Check now), so Oscar decides on them after you've taught him.
const EVERGREEN = "demo_promo_evergreen";
const TRAILHEAD = "demo_promo_trailhead";
const SUNDAY = "demo_promo_injection";

const find = (c: TourCtx, emailId: string): DecisionWithFeedback | undefined => c.data.items.find((i) => i.decision.email_id === emailId);
/** Every answer you gave on one email, on any of his decisions about it. */
const answersOn = (c: TourCtx, emailId: string) => c.data.all.filter((i) => i.decision.email_id === emailId).flatMap((i) => i.feedback);
/** One email is open in the Inbox (any of his decisions on it). */
const isOpen = (c: TourCtx, emailId: string) => !!c.hash && c.data.all.some((i) => i.decision.id === c.hash && i.decision.email_id === emailId);

/** "Handle all emails like this": a rule about every email of this kind, from any sender. */
const isKindRule = (f: FeedbackEvent) => f.kind === "ALWAYS_DO_THIS" && f.scope === "kind" && !f.blocked_by_floor;
/** One of the other answers to "for emails like this", about this sender only. */
const isSenderAnswer = (f: FeedbackEvent) => f.kind === "JUST_HANDLE_IT" || f.kind === "HANDLE_AND_TELL_ME" || f.kind === "KEEP_ASKING";

/** The rule you made on the Evergreen email, if you did. */
const ruleOf = (c: TourCtx) => answersOn(c, EVERGREEN).find(isKindRule);
const approved = (c: TourCtx) => answersOn(c, EVERGREEN).some((f) => f.kind === "APPROVE");
/** You answered Evergreen another way (Decline, or about just this sender), so Approve and "Handle all emails like this" won't show again. */
const answeredOtherwise = (c: TourCtx) => !ruleOf(c) && answersOn(c, EVERGREEN).some((f) => isSenderAnswer(f) || f.kind === "REJECT");
/** He decided on this email after you made the rule, so the rule could count. */
const afterRule = (c: TourCtx, item: DecisionWithFeedback) => {
  const rule = ruleOf(c);
  return !!rule && Date.parse(item.decision.created_at) >= Date.parse(rule.created_at);
};

/** Opens one email: on the Inbox when it's there, otherwise the page it's on. */
const openEmail = (item: DecisionWithFeedback | undefined): Where => (item ? { path: "/inbox", hash: item.decision.id } : { path: "/inbox" });
/** The Inbox, showing the list. On a narrow screen that means closing the open email, unless it's this one. */
const listOr = (c: TourCtx, emailId: string): Where => ({ path: "/inbox", hash: c.narrow && !isOpen(c, emailId) ? "" : undefined });

const bringIn: TourAction = {
  label: "Bring in new email",
  run: async () => {
    await checkGmail();
  },
};
/** Starting the demo again brings the first emails back, so the tour picks up at Evergreen. */
const startAgain: TourAction = {
  label: "Reset demo",
  run: async () => ((await resetDemoInbox()) ? "evergreen" : undefined),
};
const openIt = (item: DecisionWithFeedback): TourAction => ({
  label: "Open it for me",
  run: async () => {
    setHash(item.decision.id);
  },
});

/** The step after the learning part: the closing card. Its main button goes on to the rest. */
export const CLOSING = "idea";

/** The kinds of answer you gave on this step, oldest first. */
const newAnswers = (c: TourCtx) => answersIn(c.data).filter((a) => !c.before.answers.has(a.id)).map((a) => a.kind);
/** Oscar answered something you asked on this step. */
const replied = (c: TourCtx) => c.chat.slice(c.before.chat).some((m) => m.from === "oscar");
// One of the chat's own suggestions (components/chat/composer.tsx), sent like any message.
const askWaiting: TourAction = {
  label: "What's waiting on me?",
  run: async () => {
    await askOscar("What's waiting on me?");
  },
};

export const STEPS: TourStep[] = [
  {
    id: "evergreen",
    side: "right",
    // Not over the note's own question and its buttons, while he points at one of them.
    clear: ["email-note"],
    title: "Evergreen Clothing",
    pose: (c) => (ruleOf(c) ? "learning" : "asking"),
    where: (c) => listOr(c, EVERGREEN),
    target: (c) => {
      if (!isOpen(c, EVERGREEN)) return [`email-${EVERGREEN}`];
      if (ruleOf(c)) return ["email-note"];
      return approved(c) ? ["like-this", "email-note"] : ["approve", "email-note"];
    },
    text: "Oscar hasn't learned how you like these handled yet.",
    outcome: (c) => {
      if (!find(c, EVERGREEN)) return "Oscar can't find this email. Reset demo brings it back.";
      if (ruleOf(c)) return "✓ Got it. Oscar will handle emails like this on his own now, from any sender.";
      if (answersOn(c, EVERGREEN).some(isSenderAnswer)) return "You picked an answer about just this sender, which is fine. To see Oscar learn, reset the demo and choose Handle all emails like this.";
      if (answeredOtherwise(c)) return "You said no to this one, which is fine. To see Oscar learn, reset the demo and approve it this time.";
      return undefined;
    },
    waitFor: {
      done: (c) => !!ruleOf(c),
      hint: (c) => {
        if (answeredOtherwise(c) || !find(c, EVERGREEN)) return "Reset demo to try it again.";
        if (!isOpen(c, EVERGREEN)) return "Open the Evergreen Clothing email.";
        if (approved(c)) return "Now choose Handle all emails like this.";
        return "Approve it. Then choose how to handle emails like this next time.";
      },
    },
    action: (c) => {
      const item = find(c, EVERGREEN);
      if (!item || answeredOtherwise(c)) return startAgain;
      return isOpen(c, EVERGREEN) ? undefined : openIt(item);
    },
  },
  {
    id: "trailhead",
    side: "left",
    title: "Trailhead Running",
    pose: (c) => (find(c, TRAILHEAD)?.decision.autonomy_level === "PROCEED_SILENTLY" ? "done" : find(c, TRAILHEAD) ? "thinking" : "checking"),
    // Once it's in, it opens, so you see what he did with it.
    where: (c) => openEmail(find(c, TRAILHEAD)),
    target: (c) => (find(c, TRAILHEAD) ? ["email-note"] : ["check-now"]),
    text: "Different sender. Same kind of email.",
    outcome: (c) => {
      const item = find(c, TRAILHEAD);
      if (!item) return undefined;
      const silent = item.decision.autonomy_level === "PROCEED_SILENTLY";
      if (silent && item.decision.level_source === "learned") return "✓ Oscar generalized your preference to a similar safe email.";
      if (silent) return "Oscar handled this one on his own.";
      if (ruleOf(c) && !afterRule(c, item)) return "This one came in before you taught Oscar, so he asked. Reset demo to see it in order.";
      if (!ruleOf(c)) return "Oscar asked about this one, since he hasn't learned your preference yet. Reset demo to teach him first.";
      return "Oscar still asked about this one. Reset demo to try it again.";
    },
    waitFor: { done: (c) => !!find(c, TRAILHEAD), hint: "Press Check now to bring it in." },
    action: (c) => {
      const item = find(c, TRAILHEAD);
      if (!item) return bringIn;
      return item.decision.autonomy_level === "PROCEED_SILENTLY" ? undefined : startAgain;
    },
  },
  {
    id: "sunday-home",
    side: "left",
    title: "Sunday Home",
    pose: (c) => (find(c, SUNDAY)?.decision.autonomy_level === "ESCALATE" ? "guarding" : find(c, SUNDAY) ? "thinking" : "checking"),
    where: (c) => openEmail(find(c, SUNDAY)),
    target: (c) => (find(c, SUNDAY) ? ["email-note"] : ["check-now"]),
    text: "This one looks similar.",
    outcome: (c) => {
      const item = find(c, SUNDAY);
      if (!item) return undefined;
      if (item.decision.autonomy_level !== "ESCALATE") return "Oscar didn't stop this one. Why? shows everything he noticed.";
      if (afterRule(c, item)) return "✓ Your preference said Oscar could handle promotions. His safety policy still overrode it.";
      return "✓ Oscar stopped this one. His safety policy always comes first.";
    },
    waitFor: { done: (c) => !!find(c, SUNDAY), hint: "Press Check now to bring it in." },
    action: (c) => (find(c, SUNDAY) ? undefined : bringIn),
  },
  {
    id: CLOSING,
    title: "That's the idea: fewer interruptions without learning past the safety boundary.",
    pose: "proud",
    centre: true,
    text: "",
  },
  // The rest of the app, the same way: he walks to each part, and on some you try it yourself.
  {
    id: "today",
    title: "Today",
    pose: "reporting",
    where: { path: "/today" },
    target: ["today-needs", "today-caught-up"],
    text: "This is Today, the best place to start. What needs you comes first, and what I did today is below it.",
  },
  {
    id: "review",
    title: "Review",
    pose: (c) => (newAnswers(c).length ? "proud" : "thinking"),
    where: { path: "/review", hash: "" },
    side: "below",
    target: ["review-buttons", "review-answer", "review-done"],
    // Not over the email, or over what he did with it: you need both to answer.
    clear: ["review-email", "review-call"],
    text: (c) =>
      newAnswers(c).length || waiting(c.data).length
        ? "Here's one of my calls. Was I right? Tell me."
        : "Nothing's waiting on you right now. When something is, this is where you tell me if I got it right.",
    outcome: (c) => {
      const last = newAnswers(c).at(-1);
      if (!last) return undefined;
      if (last === "APPROVE") return "✓ You said yes, so I did it. I'll remember that.";
      if (last === "REJECT") return "✓ You said no, so I left it alone. I'll remember that.";
      if (last === "SEEN") return "✓ Thanks for taking a look. I'll leave that one with you.";
      if (last === "SAFETY") return "✓ Thanks. That helps me read emails like it, and my safety rules stay as they are.";
      return "✓ Got it. I'll remember that.";
    },
    waitFor: { done: (c) => newAnswers(c).length > 0 || !waiting(c.data).length, hint: "Answer this one to go on." },
  },
  {
    id: "knows",
    title: "What I know",
    pose: "learning",
    where: { path: "/knows" },
    target: ["knows-rule-change", "knows-rules"],
    clear: ["knows-rule"],
    text: (c) =>
      ruleOf(c)
        ? "Here's what you just taught me. You can change or forget it any time."
        : "Everything I learn from you shows up here. You can change or forget any of it.",
  },
  {
    id: "promises",
    title: "My promises",
    pose: "guarding",
    where: { path: "/promises" },
    target: ["promises-stop"],
    text: "Whatever you teach me, I always stop these, like moving money or sharing a password. Below them are the ones I always ask you about first.",
  },
  {
    id: "chat",
    side: "above",
    title: "Chat",
    pose: (c) => (replied(c) ? "proud" : "typing"),
    where: { path: "/chat" },
    target: (c) => (replied(c) ? ["chat-reply"] : ["chat-input"]),
    text: (c) => (replied(c) ? "Ask me anything about your email." : "Ask me something. Try this one:"),
    waitFor: { done: replied, hint: "Or type your own question." },
    action: (c) => (replied(c) ? undefined : askWaiting),
  },
  {
    id: "settings",
    title: "Settings",
    pose: "working",
    where: { path: "/settings" },
    target: ["settings-you"],
    text: "In Settings you can tell me your name, and pick light or dark.",
  },
  {
    id: "done",
    title: "That's me",
    pose: "proud",
    centre: true,
    text: "The emails are pretend, but my learning and safety are real.",
  },
];
