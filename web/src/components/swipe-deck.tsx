"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmailRow } from "@/components/email-row";
import { HoldButton } from "@/components/hold-button";
import { Highlight } from "@/components/highlight";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { HOLD_TO_CONFIRM } from "@/lib/labels";
import { askOscar } from "@/lib/chat-store";
import { onShowEmail } from "@/lib/show-email";
import { isAnswered, oscarSays, useOscar } from "@/lib/use-oscar";

const SWIPE = 110; // px to count as a swipe

type Move = "yes" | "no" | "always" | "skip";
const EXIT: Record<Move, { x: number; y: number }> = {
  yes: { x: 500, y: 0 },
  no: { x: -500, y: 0 },
  always: { x: 0, y: -500 },
  skip: { x: 0, y: 500 },
};

function Card({ item, onMove }: { item: DecisionWithFeedback; onMove: (m: Move) => void }) {
  const { decision } = item;
  const hold = HOLD_TO_CONFIRM[decision.action];
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
      className="absolute inset-0 flex cursor-grab touch-pan-y flex-col gap-3 rounded-3xl bg-card p-6 shadow-xl active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      // Hard-to-undo actions can't be swiped yes; they need the hold button.
      dragConstraints={hold ? { right: 0 } : undefined}
      dragElastic={hold ? { right: 0.05, left: 1 } : 1}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      variants={{ leave: (move: Move) => ({ ...EXIT[move], opacity: 0, transition: { duration: 0.25 } }) }}
      exit="leave"
    >
      <motion.span style={{ opacity: yes }} className="absolute right-5 top-5 rounded-full bg-level-silent px-3 py-1 text-sm font-medium text-black">Yes</motion.span>
      <motion.span style={{ opacity: no }} className="absolute left-5 top-5 rounded-full bg-level-escalate px-3 py-1 text-sm font-medium text-black">No</motion.span>

      <p className="text-xs text-muted-foreground">{decision.sender}</p>
      <p className="font-heading text-xl font-semibold leading-snug">
        <Highlight text={decision.subject} phrase={decision.noticed} className="bg-level-ask/35" />
      </p>
      <p className="text-sm text-muted-foreground">
        <Highlight text={decision.snippet} phrase={decision.noticed} className="bg-level-ask/35" />
      </p>
      <div className="mt-auto rounded-2xl bg-muted px-4 py-3 text-sm">{decision.message}</div>
      {hold && <p className="text-xs text-muted-foreground">{hold}, so hold the button to say yes.</p>}
    </motion.div>
  );
}

/** The emails waiting for your okay, one card at a time. Lives on Home. */
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
    const waiting = (data?.items ?? []).filter(
      (i) => i.decision.autonomy_level === "ASK_FIRST" && !isAnswered(i) && !gone.has(i.decision.id),
    );
    // Hard-to-undo ones first, since they matter most. Skipped cards go to the back.
    const weight = (i: DecisionWithFeedback) => (HOLD_TO_CONFIRM[i.decision.action] ? 0 : 1);
    const place = (i: DecisionWithFeedback) => (i.decision.id === front ? -2 : later.indexOf(i.decision.id));
    return [...waiting].sort((a, b) => place(a) - place(b) || weight(a) - weight(b));
  }, [data, gone, later, front]);
  const current = stack[0];

  async function move(m: Move) {
    if (!current) return;
    const id = current.decision.id;
    const hold = HOLD_TO_CONFIRM[current.decision.action];
    if (hold && (m === "yes" || m === "always")) {
      oscarSays(`${hold}. Hold the Yes button for this one.`);
      return;
    }
    setLastMove(m);
    setFront("");
    if (m === "skip") {
      setLater((l) => [...l.filter((x) => x !== id), id]);
      return;
    }
    setGone((g) => new Set(g).add(id));
    const steps: FeedbackKind[] = m === "yes" ? ["APPROVE"] : m === "no" ? ["REJECT"] : ["APPROVE", "ALWAYS_DO_THIS"];
    for (const kind of steps) await feedback(id, kind);
  }

  useEffect(
    () =>
      onShowEmail((id) => {
        if (!stack.some((i) => i.decision.id === id)) return;
        setFront(id);
        box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }),
    [stack],
  );

  // Arrow keys only work once you've clicked into the cards, so they still scroll the page
  // everywhere else. Keys with Alt, Cmd, Ctrl or Shift are left to the browser.
  const KEYS: Record<string, Move> = { ArrowRight: "yes", ArrowLeft: "no", ArrowUp: "always", ArrowDown: "skip" };
  function onKeyDown(e: React.KeyboardEvent) {
    if (!KEYS[e.key] || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    void move(KEYS[e.key]);
  }

  const hold = current ? HOLD_TO_CONFIRM[current.decision.action] : undefined;

  if (!data || !current) return null;

  const listToggle = (
    <button
      type="button"
      onClick={() => setAsList(!asList)}
      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      {asList ? "Show as cards" : "Show as a list"}
    </button>
  );

  // The list has everything the cards leave out: edit and send, always ask me, and the working notes.
  if (asList) {
    return (
      <div ref={box} className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {stack.map((item, index) => (
            <EmailRow key={item.decision.id} index={index} item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
          ))}
        </ul>
        <div>{listToggle}</div>
      </div>
    );
  }

  return (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Emails waiting for your okay. Arrow keys: right yes, left no, up yes and always, down later."
      className="flex flex-col items-center gap-4 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {gone.size + 1} of {gone.size + stack.length} · most important first
        </span>
        {listToggle}
      </div>
      <div className="relative h-80 w-full max-w-md">
        <AnimatePresence custom={lastMove ?? "skip"}>
          <Card key={current.decision.id} item={current} onMove={move} />
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => move("no")}>No</Button>
        {hold ? (
          <HoldButton size="default" onConfirm={() => { setLastMove("yes"); setGone((g) => new Set(g).add(current.decision.id)); feedback(current.decision.id, "APPROVE"); }}>
            Hold for yes
          </HoldButton>
        ) : (
          <Button onClick={() => move("yes")}>Yes</Button>
        )}
        <Button variant="ghost" onClick={() => move("skip")}>Later</Button>
        <Button variant="ghost" onClick={() => askOscar("Why?", current.decision.id)}>Why?</Button>
        {!hold && <Button variant="ghost" onClick={() => move("always")}>Always do this</Button>}
      </div>
      {gone.size === 0 && (
        <p className="hidden text-center text-xs text-muted-foreground sm:block">
          Swipe sideways, or click here and use the arrow keys: → yes, ← no, ↑ yes and always, ↓ later
        </p>
      )}
    </div>
  );
}
