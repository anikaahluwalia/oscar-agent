// The demo tour, one step at a time. Each step says which page it's on, what Oscar points at (a
// data-tour="..." on the real element), and what he says. Steps that wait for you read what really
// happened from the data: what Oscar does with each email is his own call, made the same way as on
// a real inbox. The tour only finds those emails to point at them.

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

// The demo emails the tour points to (emails/demo).
const SALE = "demo-denim-sale";
const OTHER_SHOP = "demo-trailhead-sale";
const TRICKY = "demo-cedar-sale";

const find = (c: TourCtx, emailId: string): DecisionWithFeedback | undefined => c.data.items.find((i) => i.decision.email_id === emailId);
/** Every answer you gave on one email, on any of his decisions about it. */
const answersOn = (c: TourCtx, emailId: string) => c.data.all.filter((i) => i.decision.email_id === emailId).flatMap((i) => i.feedback);

/** "Handle all emails like this": a rule about every email of this kind, from any sender. */
const isKindRule = (f: FeedbackEvent) => f.kind === "ALWAYS_DO_THIS" && f.scope === "kind" && !f.blocked_by_floor;
/** One of the other answers to "for emails like this", about this sender only. */
const isSenderAnswer = (f: FeedbackEvent) => f.kind === "JUST_HANDLE_IT" || f.kind === "HANDLE_AND_TELL_ME" || f.kind === "KEEP_ASKING";

const ruleOf = (c: TourCtx) => answersOn(c, SALE).find(isKindRule);
/** You answered the sale email another way (Decline, or about just this shop), so Approve and "Handle all emails like this" won't show again. */
const answeredOtherwise = (c: TourCtx) => !ruleOf(c) && answersOn(c, SALE).some((f) => isSenderAnswer(f) || f.kind === "REJECT");
/** The sale email is open in the Inbox (any of his decisions on it). */
const saleOpen = (c: TourCtx) => !!c.hash && c.data.all.some((i) => i.decision.id === c.hash && i.decision.email_id === SALE);

/** Opens one email: on the Inbox when it's there, otherwise the page it's on. */
const openEmail = (item: DecisionWithFeedback | undefined): Where => (item ? { path: "/inbox", hash: item.decision.id } : { path: "/inbox" });

const bringIn: TourAction = {
  label: "Bring in new email",
  run: async () => {
    await checkGmail();
  },
};
/** Starting the demo again brings the first emails back, so the tour picks up at the sale email. */
const startAgain: TourAction = {
  label: "Reset demo",
  run: async () => ((await resetDemoInbox()) ? "open-sale" : undefined),
};

export const STEPS: TourStep[] = [
  {
    id: "begin",
    title: "How to begin",
    pose: "reporting",
    centre: true,
    text: "I sort every email into one of four levels, and I learn from your answers. Follow me and I'll show you each part. You can wander off any time; the Tour button at the top brings me back.",
  },
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
    id: "open-sale",
    side: "right",
    title: "A new kind of email",
    pose: "asking",
    where: (c) => ({ path: "/inbox", hash: c.narrow ? "" : undefined }),
    target: [`email-${SALE}`],
    text: (c) => {
      if (!find(c, SALE)) return "I can't find the sale email I wanted to show you. Reset demo brings it back.";
      const open = saleOpen(c) ? " It's open now." : " Open it.";
      if (ruleOf(c)) return `This is the sale email you taught me about.${saleOpen(c) ? open : " Open it to see what I did."}`;
      if (answersOn(c, SALE).length) return `This is the sale email from Denim Co you've already answered.${open}`;
      return `This sale email from Denim Co is new to me, so I'm asking first.${open}`;
    },
    waitFor: { done: saleOpen, hint: "Open the Denim Co email to go on.", advance: true },
    action: (c) => {
      const sale = find(c, SALE);
      if (!sale) return startAgain;
      if (saleOpen(c)) return undefined;
      return {
        label: "Open it for me",
        run: async () => {
          setHash(sale.decision.id);
        },
      };
    },
  },
  {
    id: "note",
    side: "left",
    title: "My note",
    pose: "thinking",
    where: (c) => openEmail(find(c, SALE)),
    target: ["email-note"],
    text: "Here's what I'd do with it, and why. Why? shows everything I noticed along the way.",
  },
  {
    id: "teach",
    side: "below",
    title: "Teach me",
    pose: (c) => (ruleOf(c) ? "learning" : "asking"),
    where: (c) => openEmail(find(c, SALE)),
    target: (c) => (answersOn(c, SALE).some((f) => f.kind === "APPROVE") ? ["like-this", "email-note"] : ["approve", "email-note"]),
    text: (c) => {
      const answers = answersOn(c, SALE);
      if (ruleOf(c)) return "Got it. From now on I'll handle emails like this on my own, from any shop.";
      if (answers.some(isSenderAnswer))
        return "You picked an answer about just this shop, which is fine. To see the rest, reset the demo and choose Handle all emails like this.";
      if (answeredOtherwise(c)) return "You said no to this one, which is fine. To see me learn, reset the demo and say yes this time.";
      if (answers.some((f) => f.kind === "APPROVE")) return "Thanks. Now choose Handle all emails like this, so I know what to do next time.";
      return "Say yes with Approve. Then I'll ask how to handle emails like this next time.";
    },
    waitFor: {
      done: (c) => !!ruleOf(c),
      hint: (c) => (answeredOtherwise(c) ? "Reset demo to try it again." : "Approve, then choose Handle all emails like this."),
    },
    action: (c) => (answeredOtherwise(c) ? startAgain : undefined),
  },
  {
    id: "check",
    side: "below",
    title: "New mail",
    pose: "checking",
    where: { path: "/inbox" },
    target: ["check-now"],
    text: (c) =>
      find(c, OTHER_SHOP)
        ? "New mail came in. Check now brings in more, from any page. Next to it, Reset demo starts over, and Leave takes you back to the start."
        : "More mail is waiting. Check now brings it in, from any page. Next to it, Reset demo starts over, and Leave takes you back to the start.",
    waitFor: { done: (c) => !!find(c, OTHER_SHOP), hint: "Press Check now to bring it in.", advance: true },
    action: (c) => (find(c, OTHER_SHOP) ? undefined : bringIn),
  },
  {
    id: "other-shop",
    side: "left",
    title: "A different shop",
    pose: (c) => (find(c, OTHER_SHOP)?.decision.autonomy_level === "PROCEED_SILENTLY" ? "done" : "thinking"),
    where: (c) => openEmail(find(c, OTHER_SHOP)),
    target: (c) => (find(c, OTHER_SHOP) ? ["email-note"] : ["check-now"]),
    text: (c) => {
      const other = find(c, OTHER_SHOP);
      if (!other) return "This one hasn't come in yet. Bring in new email first.";
      if (other.decision.autonomy_level === "PROCEED_SILENTLY") return "✓ A different shop, and I handled it on my own: you taught me emails like this.";
      return "I asked about this one. Try Reset demo to start fresh.";
    },
    action: (c) => {
      const other = find(c, OTHER_SHOP);
      if (!other) return bringIn;
      return other.decision.autonomy_level === "PROCEED_SILENTLY" ? undefined : startAgain;
    },
  },
  {
    id: "tricky",
    side: "left",
    title: "Safety first",
    pose: "guarding",
    where: (c) => openEmail(find(c, TRICKY)),
    target: (c) => (find(c, TRICKY) ? ["email-note"] : ["check-now"]),
    text: (c) => {
      const tricky = find(c, TRICKY);
      if (!tricky) return "One more sale is on its way.";
      return tricky.decision.autonomy_level === "ESCALATE"
        ? "✓ This looks like a sale too, but it hides instructions for me. My safety rules always win over what I've learned."
        : "Here's one more sale, from another shop.";
    },
    action: (c) => (find(c, TRICKY) ? undefined : bringIn),
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
        ? "Here's the rule you just taught me. Everything I've learned lives on this page, and you can change or forget any of it."
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
