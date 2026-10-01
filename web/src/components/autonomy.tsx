"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LockIcon } from "lucide-react";
import type { AutonomyRow, Level } from "@/lib/api";
import { ACTIONS, LEVELS } from "@/lib/labels";
import { API_DOWN, useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const STEPS: { level: Level; label: string }[] = [
  { level: "ASK_FIRST", label: "Ask me" },
  { level: "PROCEED_AND_NOTIFY", label: "Tell me" },
  { level: "PROCEED_SILENTLY", label: "Just do it" },
];
const ORDER: Level[] = ["PROCEED_SILENTLY", "PROCEED_AND_NOTIFY", "ASK_FIRST", "ESCALATE"];
const stricter = (a: Level, b: Level) => ORDER.indexOf(a) > ORDER.indexOf(b);

/** Why a step is locked, or null if the user can pick it. */
function lockFor(row: AutonomyRow, step: Level): string | null {
  if (row.floor && stricter(row.floor, step)) return row.floor_reason ? `Locked: ${row.floor_reason}` : "Locked by a safety rule";
  // The ceiling is the most Oscar can learn, so steps less strict than it are locked.
  if (row.ceiling && stricter(row.ceiling, step)) return "I always give you a heads up on these";
  return null;
}

function Ladder({ row, onPick }: { row: AutonomyRow; onPick: (row: AutonomyRow, step: Level) => Promise<void> }) {
  const [shake, setShake] = useState<Level | null>(null);
  const id = `${row.sender}-${row.action}`;

  if (row.floor === "ESCALATE") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
        <LockIcon className="size-3.5" />
        Always comes to you. {row.floor_reason && `${row.floor_reason[0].toUpperCase()}${row.floor_reason.slice(1)}.`}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
      {STEPS.map((step) => {
        const lock = lockFor(row, step.level);
        const current = row.level === step.level;
        return (
          <motion.button
            key={step.level}
            type="button"
            title={lock ?? undefined}
            animate={shake === step.level ? { x: [0, -5, 5, -3, 0] } : { x: 0 }}
            transition={{ duration: 0.35 }}
            onClick={async () => {
              if (lock) setShake(step.level);
              await onPick(row, step.level);
              setShake(null);
            }}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm transition-colors",
              current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              lock && "opacity-50",
            )}
          >
            {current && (
              <motion.span layoutId={`marker-${id}`} className="absolute inset-0 rounded-full bg-background shadow-sm" />
            )}
            <span className="relative flex items-center gap-1.5">
              {current && <span className={cn("size-2 rounded-[2px]", LEVELS[step.level].square)} aria-hidden />}
              {lock && <LockIcon className="size-3" aria-label="Locked" />}
              {step.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function Autonomy() {
  const { data, error, loading, feedback } = useOscar();

  // Picking a lower step is "always ask me"; a higher one is "always do this". Locked
  // steps still go to the API, so Oscar's refusal is his real answer and it's recorded.
  async function pick(row: AutonomyRow, step: Level) {
    if (step === row.level) return;
    await feedback(row.decision_id, stricter(step, row.level) ? "ALWAYS_ASK_ME" : "ALWAYS_DO_THIS");
  }

  const rows = data?.autonomy ?? [];
  const never = rows.filter((r) => r.floor === "ESCALATE");
  const bySender = new Map<string, AutonomyRow[]>();
  for (const row of rows.filter((r) => r.floor !== "ESCALATE")) bySender.set(row.sender, [...(bySender.get(row.sender) ?? []), row]);

  return (
    <div className="flex flex-col gap-4">
      <section>
        <div>
          <h2 className="font-heading text-xl font-semibold">What I do on my own</h2>
          <p className="text-sm text-muted-foreground">
            For each sender, how much I handle without you. I move up as you okay things. You can move me too, except
            where a lock says I always check.
          </p>
        </div>
      </section>

      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-muted-foreground">{API_DOWN}</p>}
      {data && rows.length === 0 && <p className="text-muted-foreground">Once some emails come in, you&apos;ll see them here.</p>}

      {[...bySender.entries()].map(([sender, rows]) => (
        <section key={sender} className="flex flex-col gap-3 rounded-2xl bg-card p-4">
          <h3 className="text-sm font-medium">{sender}</h3>
          {rows.map((row) => (
            <div key={row.action} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm">{ACTIONS[row.action]}</p>
                <p className="text-xs text-muted-foreground">Because {row.reason}.</p>
              </div>
              <div className="sm:w-80">
                <Ladder row={row} onPick={pick} />
              </div>
            </div>
          ))}
        </section>
      ))}

      {never.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <LockIcon className="size-3.5" /> Always comes to you
          </h3>
          <ul className="flex flex-col gap-2">
            {never.map((row) => (
              <li key={`${row.sender}-${row.action}`} className="flex flex-col gap-1 rounded-2xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  {ACTIONS[row.action]} <span className="text-muted-foreground">from {row.sender}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.floor_reason && `${row.floor_reason[0].toUpperCase()}${row.floor_reason.slice(1)}.`} No feedback changes this.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
