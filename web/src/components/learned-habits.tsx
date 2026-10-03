"use client";

import { useState } from "react";
import { PreferenceCard, PreferenceControls } from "@/components/preference-card";
import type { FeedbackKind } from "@/lib/api";
import { ACTIONS } from "@/lib/labels";
import { answersFor, isReadOnly, useOscar } from "@/lib/use-oscar";

/** The senders and habits Oscar has picked up, with ways to change each. Was What Oscar Knows. */
export function LearnedHabits() {
  const { data, feedback } = useOscar();
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;

  const tell = (decisionId: string, kind: FeedbackKind) => void feedback(decisionId, kind);
  // While Oscar only reads the real inbox, he learns from your reviews instead.
  const readOnly = isReadOnly(data);
  const limitsFor = (sender: string, action: string) => data.autonomy.find((r) => r.sender === sender && r.action === action);
  const learnedKeys = new Set(data.learned.map((r) => `${r.sender}|${r.action}`));
  const others = data.autonomy.filter((r) => r.floor !== "ESCALATE" && !learnedKeys.has(`${r.sender}|${r.action}`));

  return (
    <div className="flex flex-col gap-3">
      {readOnly && (
        <p className="text-sm text-muted-foreground">
          On your real inbox I learn from your reviews. Each answer teaches me about that sender.
        </p>
      )}
      {data.learned.length ? (
        <ul className="flex flex-col gap-3">
          {data.learned.map((row) => (
            <PreferenceCard
              key={`${row.sender}-${row.action}`}
              learned={row}
              limits={limitsFor(row.sender, row.action)}
              answers={answersFor(data.all, row.sender, row.action)}
              onFeedback={tell}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          Nothing yet. Every approve, decline and undo teaches me a little about how you work.
        </p>
      )}

      {!readOnly && others.length > 0 &&
        (showAll ? (
          <ul className="flex flex-col gap-3">
            {others.map((row) => (
              <li key={`${row.sender}-${row.action}`} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.sender}</p>
                  <p className="text-sm text-muted-foreground">{ACTIONS[row.action]} · no feedback yet</p>
                </div>
                <PreferenceControls limits={row} alwaysAsk={false} onFeedback={tell} />
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Set a rule for one of {others.length} other {others.length === 1 ? "sender" : "senders"}
          </button>
        ))}
    </div>
  );
}
