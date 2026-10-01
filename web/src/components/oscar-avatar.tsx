"use client";

import Image from "next/image";
import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import type { Level } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Mood = "calm" | "happy" | "curious" | "alert";

// Small moves only. The drawing stays the same; Oscar's mood is in how he moves.
const MOODS: Record<Mood, TargetAndTransition> = {
  calm: { rotate: 0, y: 0 },
  happy: { rotate: [0, -8, 8, -4, 0], transition: { duration: 0.7 } },
  curious: { rotate: 9, transition: { type: "spring", stiffness: 200, damping: 12 } },
  alert: { y: [0, -5, 0, -3, 0], transition: { duration: 0.6 } },
};

export const MOOD_FOR_LEVEL: Record<Level, Mood> = {
  PROCEED_SILENTLY: "happy",
  PROCEED_AND_NOTIFY: "happy",
  ASK_FIRST: "curious",
  ESCALATE: "alert",
};

type Props = { size?: number; mood?: Mood; className?: string };

export function OscarAvatar({ size = 32, mood = "calm", className }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: size, height: size }}
      animate={reduceMotion ? undefined : MOODS[mood]}
      key={mood}
    >
      <Image src="/oscar-face.png" alt="Oscar" width={size} height={size} />
      {mood === "alert" && (
        <span
          className="absolute -top-0.5 -right-0.5 rounded-full bg-level-escalate ring-2 ring-background"
          style={{ width: Math.max(6, size / 6), height: Math.max(6, size / 6) }}
          aria-hidden
        />
      )}
    </motion.div>
  );
}
