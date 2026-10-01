"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HoldButton } from "@/components/hold-button";
import { Highlight } from "@/components/highlight";
import { OscarAvatar, type Mood } from "@/components/oscar-avatar";
import type { DecisionWithFeedback, FeedbackKind } from "@/lib/api";
import { HOLD_TO_CONFIRM } from "@/lib/labels";
import { openOscar } from "@/lib/panel";
import { API_DOWN, isAnswered, oscarSays, useOscar } from "@/lib/use-oscar";

const SWIPE = 110; // px to count as a swipe

type Move = "yes" | "no" | "always" | "skip";
const EXIT: Record<Move, { x: number; y: number }> = {
  yes: { x: 500, y: 0 },
  no: { x: -500, y: 0 },
  always: { x: 0, y: -500 },
  skip: { x: 0, y: 500 },
};
const MOOD_AFTER: Record<Move, Mood> = { yes: "happy", always: "happy", no: "calm", skip: "curious" };

function Card({ item, onMove }: { item: DecisionWithFeedback; onMove: (m: Move) => void }) {
  const { decision } = item;
  const hold = HOLD_TO_CONFIRM[decision.action];
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-10, 10]);
  const yes = useTransform(x, [20, SWIPE], [0, 1]);
  const no = useTransform(x, [-SWIPE, -20], [1, 0]);
  const always = useTransform(y, [-SWIPE, -20], [1, 0]);
  const skip = useTransform(y, [20, SWIPE], [0, 1]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const { x: dx, y: dy } = info.offset;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > SWIPE) onMove("yes");
      else if (dx < -SWIPE) onMove("no");
    } else {
      if (dy < -SWIPE) onMove("always");
      else if (dy > SWIPE) onMove("skip");
    }
  }

  return (
    <motion.div
      className="absolute inset-0 flex cursor-grab touch-none flex-col gap-3 rounded-3xl border bg-card p-6 shadow-xl active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag
      // Hard-to-undo actions can't be swiped yes or "always"; they need the hold button.
      dragConstraints={hold ? { right: 0, top: 0 } : undefined}
      dragElastic={hold ? { right: 0.05, top: 0.05, left: 1, bottom: 1 } : 1}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      variants={{ leave: (move: Move) => ({ ...EXIT[move], opacity: 0, transition: { duration: 0.25 } }) }}
      exit="leave"
    >
      <motion.span style={{ opacity: yes }} className="absolute right-5 top-5 rounded-full bg-level-silent px-3 py-1 text-sm font-medium text-black">Yes</motion.span>
      <motion.span style={{ opacity: no }} className="absolute left-5 top-5 rounded-full bg-level-escalate px-3 py-1 text-sm font-medium text-black">No</motion.span>
      <motion.span style={{ opacity: always }} className="absolute inset-x-0 top-5 mx-auto w-fit rounded-full bg-level-notify px-3 py-1 text-sm font-medium text-black">Always</motion.span>
      <motion.span style={{ opacity: skip }} className="absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full bg-muted px-3 py-1 text-sm font-medium">Later</motion.span>

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

export function Triage() {
  const { data, error, loading, feedback } = useOscar();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [later, setLater] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);

  const stack = useMemo(() => {
    const waiting = (data?.items ?? []).filter(
      (i) => i.decision.autonomy_level === "ASK_FIRST" && !isAnswered(i) && !gone.has(i.decision.id),
    );
    // Hard-to-undo ones first, since they matter most. Skipped cards go to the back.
    const weight = (i: DecisionWithFeedback) => (HOLD_TO_CONFIRM[i.decision.action] ? 0 : 1);
    return [...waiting].sort(
      (a, b) => later.indexOf(a.decision.id) - later.indexOf(b.decision.id) || weight(a) - weight(b),
    );
  }, [data, gone, later]);
  const current = stack[0];
  const forYou = (data?.items ?? []).filter((i) => i.decision.autonomy_level === "ESCALATE").length;

  async function move(m: Move) {
    if (!current) return;
    const id = current.decision.id;
    const hold = HOLD_TO_CONFIRM[current.decision.action];
    if (hold && (m === "yes" || m === "always")) {
      oscarSays(`${hold}. Hold the Yes button for this one.`);
      return;
    }
    setLastMove(m);
    if (m === "skip") {
      setLater((l) => [...l.filter((x) => x !== id), id]);
      return;
    }
    setGone((g) => new Set(g).add(id));
    const steps: FeedbackKind[] = m === "yes" ? ["APPROVE"] : m === "no" ? ["REJECT"] : ["APPROVE", "ALWAYS_DO_THIS"];
    for (const kind of steps) await feedback(id, kind);
  }

  useEffect(() => {
    const keys: Record<string, Move> = { ArrowRight: "yes", ArrowLeft: "no", ArrowUp: "always", ArrowDown: "skip" };
    const onKey = (e: KeyboardEvent) => {
      if (keys[e.key]) {
        e.preventDefault();
        move(keys[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hold = current ? HOLD_TO_CONFIRM[current.decision.action] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-4 pb-16 pt-4">
      <OscarAvatar size={96} mood={current ? (lastMove ? MOOD_AFTER[lastMove] : "curious") : data ? "sleepy" : "calm"} key={stack.length} />

      {loading && <p className="text-muted-foreground">Getting your emails ready...</p>}
      {error && <p className="text-center text-sm text-muted-foreground">{API_DOWN}</p>}

      {data && !current && (
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl font-semibold">All caught up.</h1>
          <p className="text-muted-foreground">
            Nothing is waiting for your okay.{forYou > 0 && ` ${forYou} ${forYou === 1 ? "email is" : "emails are"} for you on Home.`}
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      )}

      {current && (
        <>
          <p className="text-sm text-muted-foreground">
            {gone.size + 1} of {gone.size + stack.length} · most important first{forYou > 0 && ` · ${forYou} for you on Home`}
          </p>
          <div className="relative h-80 w-full">
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
            <Button variant="ghost" onClick={() => openOscar({ tab: "chat", message: "Why?", decisionId: current.decision.id })}>
              Why?
            </Button>
            {!hold && <Button variant="ghost" onClick={() => move("always")}>Always do this</Button>}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Swipe or use the arrow keys: → yes, ← no, ↑ yes and always, ↓ later
          </p>
        </>
      )}
    </main>
  );
}
