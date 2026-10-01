"use client";

import { Button } from "@/components/ui/button";
import { Ladder, lockFor } from "@/components/ladder";
import type { AutonomyRow, FeedbackKind, LearnedRow, Level } from "@/lib/api";
import { ACTIONS } from "@/lib/labels";
import type { Answers } from "@/lib/use-oscar";

export const DOES: Record<Level, string> = {
  PROCEED_SILENTLY: "Handles it on his own",
  PROCEED_AND_NOTIFY: "Does it and tells you",
  ASK_FIRST: "Asks you first",
  ESCALATE: "Always brings it to you",
};

/** "Approved 3 · declined 1": how you've actually answered, counted from your feedback. */
export function answerLine(a: Answers) {
  const parts = [a.approved && `approved ${a.approved}`, a.declined && `declined ${a.declined}`, a.undone && `undone ${a.undone}`].filter(Boolean);
  if (!parts.length) return "No answers yet";
  const line = parts.join(" · ");
  return line[0].toUpperCase() + line.slice(1);
}

const UP: Partial<Record<Level, Level>> = { ASK_FIRST: "PROCEED_AND_NOTIFY", PROCEED_AND_NOTIFY: "PROCEED_SILENTLY" };

type ControlsProps = { limits: AutonomyRow; alwaysAsk: boolean; onFeedback: (decisionId: string, kind: FeedbackKind) => void };

/** The two things you can tell Oscar about a sender and action, and what each one does. */
export function PreferenceControls({ limits, alwaysAsk, onFeedback }: ControlsProps) {
  const next = UP[limits.level];
  const canMoveUp = !!next && !lockFor(limits, next);
  if (limits.floor === "ESCALATE") return <Ladder row={limits} />;
  return (
    <div className="flex flex-col gap-2">
      <Ladder row={limits} />
      <div className="flex flex-wrap gap-2">
        {canMoveUp && (
          <Button size="sm" variant="outline" onClick={() => onFeedback(limits.decision_id, "ALWAYS_DO_THIS")}>
            Do this on your own
          </Button>
        )}
        {!alwaysAsk && limits.level !== "ASK_FIRST" && (
          <Button size="sm" variant="ghost" onClick={() => onFeedback(limits.decision_id, "ALWAYS_ASK_ME")}>
            Always ask me
          </Button>
        )}
      </div>
      {canMoveUp && (
        <p className="text-xs text-muted-foreground">
          &ldquo;Do this on your own&rdquo; counts like three approvals. Oscar moves up a step once he&apos;s sure enough.
        </p>
      )}
    </div>
  );
}

type Props = { learned: LearnedRow; limits?: AutonomyRow; answers: Answers; onFeedback: ControlsProps["onFeedback"]; readOnly?: boolean };

/** Something Oscar has learned about one sender and action. */
export function PreferenceCard({ learned, limits, answers, onFeedback, readOnly }: Props) {
  const level = limits?.level;
  const anyAnswers = answers.approved + answers.declined + answers.undone > 0;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{learned.sender}</p>
          <p className="text-sm text-muted-foreground">
            {ACTIONS[learned.action]} · {learned.always_ask ? "Always asks you (your rule)" : level ? DOES[level] : "Still learning"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm">{answerLine(answers)}</p>
          {/* Oscar's estimate includes a neutral starting point, so it's only shown once you've answered. */}
          {anyAnswers && !learned.always_ask && (
            <p className="text-xs text-muted-foreground">Oscar&apos;s estimate: {Math.round(learned.mean * 100)}% you&apos;re fine with it</p>
          )}
        </div>
      </div>
      {limits && (readOnly ? <Ladder row={limits} /> : <PreferenceControls limits={limits} alwaysAsk={learned.always_ask} onFeedback={onFeedback} />)}
    </li>
  );
}
