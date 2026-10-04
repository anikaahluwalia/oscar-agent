// The demo tour, one step at a time. Each step says which page it's on, what Oscar points at (a
// data-tour="..." on the real element), and what it says. First how Oscar learns, on three emails,
// then a closing card; its "Show me around" goes on through the rest of the app. Steps that wait
// for you read what really happened from the data: what Oscar does with each email is his own
// call, made the same way as on a real inbox. The tour only finds those emails to point at them.

import type { OscarPose } from "@/components/oscar-mood";
import type { DecisionWithFeedback, FeedbackEvent } from "@/lib/api";
import { waiting } from "@/lib/counts";
import { checkGmail, resetDemoInbox } from "@/lib/demo";
import { setHash } from "@/lib/use-hash";
import type { OscarData } from "@/lib/use-oscar";

/**
 * What a step can look at: the app's data, the email open in the Inbox (/inbox#<id>), and whether
 * the screen is narrow enough that the Inbox shows the list or the open email, not both (below lg).
 */
export type TourCtx = { data: OscarData; hash: string; narrow: boolean };

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

/** The step after the learning part: the closing card. Its "Show me around" goes on to the rest. */
export const CLOSING = "idea";

export const STEPS: TourStep[] = [
  {
    id: "evergreen",
    side: "right",
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
  // "Show me around": the rest of the app, for people who want it.
  {
    id: "today",
    side: "right",
    title: "Today",
    pose: "reporting",
    where: { path: "/today" },
    target: ["nav-today"],
    text: "This is Today, your summary of the day. It's the best place to start: what I handled, what needs you, and what's coming up.",
  },
  {
    id: "today-needs",
    title: "What needs you",
    pose: "asking",
    where: { path: "/today" },
    target: ["today-needs", "today-caught-up"],
    text: (c) =>
      waiting(c.data).length
        ? "These are waiting on you: emails I asked about, and ones I stopped. You can answer most of them right here."
        : "Nothing needs you right now. When I ask about something or stop it, it shows up here first.",
  },
  {
    id: "today-day",
    title: "Your day",
    pose: "done",
    where: { path: "/today" },
    target: ["today-day"],
    text: "Here's what I took care of today, and what's coming up: events and due dates I spotted in your email.",
  },
  {
    id: "inbox",
    side: "right",
    title: "Four levels",
    pose: "working",
    // On a narrow screen the list only shows while no email is open.
    where: (c) => ({ path: "/inbox", hash: c.narrow ? "" : undefined }),
    target: ["inbox-list"],
    text: "Every email I read is here. The coloured line says what I did with it:",
    levels: true,
  },
  {
    id: "inbox-filters",
    side: "below",
    title: "Narrow it down",
    pose: "working",
    where: (c) => ({ path: "/inbox", hash: c.narrow ? "" : undefined }),
    target: ["inbox-filters"],
    text: "These narrow the list: what I took care of, what's waiting on you, and what I held back. The search box finds any sender or subject.",
  },
  {
    id: "check",
    side: "below",
    title: "New mail",
    pose: "checking",
    target: ["check-now"],
    text: "Check now brings in new email, from any page. Next to it, Reset demo starts over, and Leave takes you back to the start.",
  },
  {
    id: "review",
    side: "left",
    title: "Review",
    pose: "thinking",
    where: { path: "/review" },
    target: ["review-answer", "review-done"],
    text: "Go through my calls here, one at a time, and tell me what I got right. That's how I learn the rest.",
  },
  {
    id: "knows",
    title: "What I know",
    pose: "learning",
    where: { path: "/knows" },
    target: ["knows-rule", "knows-rules"],
    text: (c) =>
      ruleOf(c)
        ? "Here's the rule you taught me. Everything I've learned lives on this page, and you can change or forget any of it."
        : "Everything I've learned lives on this page: your rules, patterns and senders. You can change or forget any of it.",
  },
  {
    id: "promises",
    title: "My promises",
    pose: "guarding",
    where: { path: "/promises" },
    target: ["promises-stop"],
    text: "Some things I never do on my own, whatever I learn. These I always stop, like moving money, sharing a password, or following instructions hidden in an email. Below them are the ones that always wait for your yes, like deleting or sending.",
  },
  {
    id: "settings",
    side: "right",
    title: "Settings",
    pose: "working",
    where: { path: "/settings" },
    target: ["nav-settings", "nav-more"],
    text: "Your name, light or dark, and the chat live in Settings. With your real Gmail, it's also where you connect it.",
  },
  {
    id: "chat",
    side: "above",
    title: "Chat",
    pose: "typing",
    where: { path: "/chat" },
    target: ["chat-input"],
    text: "Ask me anything about your email here, or tell me how to handle something. That's everything. This inbox is pretend, but my learning and safety are real.",
  },
];
