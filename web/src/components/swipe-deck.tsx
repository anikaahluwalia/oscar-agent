"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmailRow } from "@/components/email-row";
import { HoldButton } from "@/components/hold-button";
import { Highlight } from "@/components/highlight";
import type { DecisionWithFeedback, FeedbackKind, Level } from "@/lib/api";
import { askOscar } from "@/lib/chat-store";
import { HOLD_TO_CONFIRM, LEVELS } from "@/lib/labels";
import { onShowEmail } from "@/lib/show-email";
import { isDone, oscarSays, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const SWIPE = 110; // px to count as a swipe

type Move = "yes" | "no" | "always" | "skip";
const EXIT: Record<Move, { x: number; y: number }> = {
  yes: { x: 500, y: 0 },
  no: { x: -500, y: 0 },
  always: { x: 0, y: -500 },
  skip: { x: 0, y: 500 },
};

// What yes and no mean on each kind of card. Emails Oscar brought to you have no "no":
// he isn't doing anything with them, so all you can say is that you've got it.
type Answer = { label: string; kind: FeedbackKind };
const ANSWERS: Partial<Record<Level, { yes: Answer; no?: Answer }>> = {
  ESCALATE: { yes: { label: "Got it", kind: "SEEN" } },
  ASK_FIRST: { yes: { label: "Yes", kind: "APPROVE" }, no: { label: "No", kind: "REJECT" } },
  PROCEED_AND_NOTIFY: { yes: { label: "Looks good", kind: "APPROVE" }, no: { label: "Undo", kind: "UNDO" } },
};
const HIGHLIGHT: Partial<Record<Level, string>> = {
  ESCALATE: "bg-level-escalate/35",
  ASK_FIRST: "bg-level-ask/35",
  PROCEED_AND_NOTIFY: "bg-level-notify/35",
};

/** Most important first: emails for you, then hard-to-undo asks, other asks, and what Oscar told you. */
function weight(item: DecisionWithFeedback) {
  const { autonomy_level: level, action } = item.decision;
  if (level === "ESCALATE") return 0;
  if (level === "ASK_FIRST") return HOLD_TO_CONFIRM[action] ? 1 : 2;
  return 3;
}

function Card({ item, onMove }: { item: DecisionWithFeedback; onMove: (m: Move) => void }) {
  const { decision } = item;
  const level = decision.autonomy_level;
  const answers = ANSWERS[level]!;
  const hold = level === "ASK_FIRST" ? HOLD_TO_CONFIRM[decision.action] : undefined;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-10, 10]);
  const yes = useTransform(x, [20, SWIPE], [0, 1]);
  const no = useTransform(x, [-SWIPE, -20], [1, 0]);

  // Sideways only: the card sits on Home, which scrolls, so up and down are for the page.
  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE) onMove("yes");
    else if (info.offset.x < -SWIPE) onMove("no");
  }

  return (
    <motion.div
      className="flex min-h-72 w-full cursor-grab touch-pan-y flex-col gap-3 rounded-3xl bg-card p-6 shadow-xl active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      // Hard-to-undo actions can't be swiped yes (they need the hold button), and there's no "no" to swipe on some cards.
      dragConstraints={{ ...(hold ? { right: 0 } : {}), ...(answers.no ? {} : { left: 0 }) }}
      dragElastic={{ right: hold ? 0.05 : 1, left: answers.no ? 1 : 0.05 }}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      // No move means the card left some other way (answered in the chat, or another card was pulled forward).
      variants={{ leave: (move: Move | null) => ({ ...(move ? EXIT[move] : { scale: 0.96 }), opacity: 0, transition: { duration: 0.25 } }) }}
      exit="leave"
    >
      <motion.span style={{ opacity: yes }} className="absolute right-5 top-5 rounded-full bg-level-silent px-3 py-1 text-sm font-medium text-black">
        {answers.yes.label}
      </motion.span>
      {answers.no && (
        <motion.span style={{ opacity: no }} className="absolute left-5 top-5 rounded-full bg-level-escalate px-3 py-1 text-sm font-medium text-black">
          {answers.no.label}
        </motion.span>
      )}

      <p className="flex items-center gap-2 text-sm font-medium">
        <span className={cn("size-2.5 rounded-[2px]", LEVELS[level].square)} aria-hidden />
        {LEVELS[level].label}
      </p>
      <div>
        <p className="font-heading text-xl font-semibold leading-snug">
          <Highlight text={decision.subject} phrase={decision.noticed} className={HIGHLIGHT[level]} />
        </p>
        <p className="text-sm text-muted-foreground">{decision.sender}</p>
      </div>
      <p className="line-clamp-3 text-muted-foreground">
        <Highlight text={decision.snippet} phrase={decision.noticed} className={HIGHLIGHT[level]} />
      </p>
      <div className="mt-auto rounded-2xl bg-muted px-4 py-3">{decision.message}</div>
    </motion.div>
  );
}

/** Everything that needs you, one card at a time. Lives on Home. */
export function SwipeDeck() {
  const { data, feedback } = useOscar();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [later, setLater] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [asList, setAsList] = useState(false);
  // A card someone pointed at (a chat chip, or a link with its #id) jumps to the front.
  // The deck only renders in the browser, once the inbox has loaded, so reading the hash is safe.
  const [front, setFront] = useState(() => window.location.hash.slice(1));
  const box = useRef<HTMLDivElement>(null);

  const stack = useMemo(() => {
    const open = (data?.items ?? []).filter(
      (i) => ANSWERS[i.decision.autonomy_level] && !isDone(i) && !gone.has(i.decision.id),
    );
    // Skipped cards go to the back.
    const place = (i: DecisionWithFeedback) => (i.decision.id === front ? -2 : later.indexOf(i.decision.id));
    return [...open].sort((a, b) => place(a) - place(b) || weight(a) - weight(b));
  }, [data, gone, later, front]);
  const current = stack[0];

  async function move(m: Move) {
    if (!current) return;
    const { id, autonomy_level: level, action } = current.decision;
    const answers = ANSWERS[level]!;
    const hold = level === "ASK_FIRST" ? HOLD_TO_CONFIRM[action] : undefined;
    if (hold && (m === "yes" || m === "always")) {
      oscarSays(`${hold}. Hold the Yes button for this one.`);
      return;
    }
    if ((m === "no" && !answers.no) || (m === "always" && level !== "ASK_FIRST")) return;
    setLastMove(m);
    setFront("");
    if (m === "skip") {
      setLater((l) => [...l.filter((x) => x !== id), id]);
      return;
    }
    const steps: FeedbackKind[] =
      m === "yes" ? [answers.yes.kind] : m === "no" ? [answers.no!.kind] : ["APPROVE", "ALWAYS_DO_THIS"];
    await answer(id, steps);
  }

  /** Takes the card off the stack, and puts it back if Oscar couldn't save the answer. */
  async function answer(id: string, kinds: FeedbackKind[]) {
    setGone((g) => new Set(g).add(id));
    for (const kind of kinds) {
      if (!(await feedback(id, kind))) {
        setGone((g) => {
          const next = new Set(g);
          next.delete(id);
          return next;
        });
        return;
      }
    }
  }

  useEffect(
    () =>
      onShowEmail((id) => {
        // In the list, the row opens itself.
        if (asList || !stack.some((i) => i.decision.id === id)) return;
        setLastMove(null);
        setFront(id);
        box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }),
    [stack, asList],
  );

  // Arrow keys only work once you've clicked into the cards, so they still scroll the page
  // everywhere else. Keys with Alt, Cmd, Ctrl or Shift are left to the browser.
  const KEYS: Record<string, Move> = { ArrowRight: "yes", ArrowLeft: "no", ArrowUp: "always", ArrowDown: "skip" };
  function onKeyDown(e: React.KeyboardEvent) {
    if (!KEYS[e.key] || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    void move(KEYS[e.key]);
  }

  if (!data || !current) return null;

  const level = current.decision.autonomy_level;
  const answers = ANSWERS[level]!;
  const hold = level === "ASK_FIRST" ? HOLD_TO_CONFIRM[current.decision.action] : undefined;
  const header = (
    <div className="flex w-full items-center justify-between gap-2 text-muted-foreground">
      {/* The same number as the headline, so there's nothing to add up. */}
      <span>{stack.length} left · most important first</span>
      <button type="button" onClick={() => setAsList(!asList)} className="underline underline-offset-4 hover:text-foreground">
        {asList ? "Show as cards" : "Show as a list"}
      </button>
    </div>
  );

  // The list has everything the cards leave out: edit and send, always ask me, and the working notes.
  if (asList) {
    return (
      <div ref={box} className="flex flex-col gap-3">
        {header}
        <ul className="flex flex-col gap-2">
          {stack.map((item, index) => (
            <EmailRow key={item.decision.id} index={index} item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`What needs you. Arrow keys: right ${answers.yes.label}${answers.no ? `, left ${answers.no.label}` : ""}${level === "ASK_FIRST" && !hold ? ", up yes and always" : ""}, down later.`}
      className="flex flex-col gap-4 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {header}
      {/* popLayout: the leaving card floats off on its own, so the card can be as tall as its email. */}
      <div className="relative w-full">
        <AnimatePresence mode="popLayout" initial={false} custom={lastMove} onExitComplete={() => setLastMove(null)}>
          <Card key={current.decision.id} item={current} onMove={move} />
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap gap-2">
        {answers.no && <Button variant="outline" onClick={() => move("no")}>{answers.no.label}</Button>}
        {hold ? (
          <HoldButton size="default" onConfirm={() => { setLastMove("yes"); void answer(current.decision.id, ["APPROVE"]); }}>
            Hold for yes
          </HoldButton>
        ) : (
          <Button onClick={() => move("yes")}>{answers.yes.label}</Button>
        )}
        <Button variant="ghost" onClick={() => move("skip")}>Later</Button>
        <Button variant="ghost" onClick={() => askOscar("Why?", current.decision.id)}>Why?</Button>
        {level === "ASK_FIRST" && !hold && <Button variant="ghost" onClick={() => move("always")}>Always do this</Button>}
      </div>
      {hold && <p className="text-sm text-muted-foreground">{hold}, so hold the button to say yes.</p>}
    </div>
  );
}
