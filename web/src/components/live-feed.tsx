"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon } from "lucide-react";
import { LevelTag } from "@/components/level-tag";
import type { DecisionWithFeedback } from "@/lib/api";

const STEP_MS = 650;

/** One email Oscar worked on. New ones play his working notes one at a time. */
function LiveItem({ item, animate }: { item: DecisionWithFeedback; animate: boolean }) {
  const { decision } = item;
  const notes = decision.steps.slice(0, -1); // the last note is the outcome, shown as the tag
  const [shown, setShown] = useState(animate ? 0 : notes.length);

  useEffect(() => {
    if (shown >= notes.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, notes.length]);

  const done = shown >= notes.length;
  return (
    <motion.li
      initial={animate ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-1.5 rounded-xl border bg-card p-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate text-sm font-medium">{decision.subject}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
          {new Date(decision.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {notes.slice(0, shown).map((note) => (
          <li key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckIcon className="mt-0.5 size-3 shrink-0" />
            {note}
          </li>
        ))}
        {!done && (
          <li className="flex items-center gap-2 text-xs">
            <span className="size-1.5 animate-pulse rounded-full bg-level-silent" />
            {notes[shown]}…
          </li>
        )}
      </ul>
      {done && <LevelTag level={decision.autonomy_level} />}
    </motion.li>
  );
}

export function LiveFeed({ items, ready }: { items: DecisionWithFeedback[]; ready: boolean }) {
  // Emails already there when the data first loaded don't replay; ones that arrive after do.
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  if (baseline === null && ready) setBaseline(new Set(items.map((i) => i.decision.id)));
  const newest = [...items].sort((a, b) => b.decision.created_at.localeCompare(a.decision.created_at)).slice(0, 20);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">I read every email as it comes in and decide how much to do on my own.</p>
      {newest.length === 0 && <p className="text-sm text-muted-foreground">No emails yet. I&apos;m watching.</p>}
      <ul className="flex flex-col gap-2">
        {newest.map((item) => (
          <LiveItem key={item.decision.id} item={item} animate={baseline !== null && !baseline.has(item.decision.id)} />
        ))}
      </ul>
    </div>
  );
}
