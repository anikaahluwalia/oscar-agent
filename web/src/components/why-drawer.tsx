"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ShieldIcon } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { StatusPill } from "@/components/status-pill";
import type { AutonomyRow, Decision, LearnedRow } from "@/lib/api";
import { onOpenWhy } from "@/lib/drawers";
import { ACTIONS, FLAGS, LEVEL_SOURCES, riskOf, STATUS, wouldOnly } from "@/lib/labels";
import { answersFor, useOscar } from "@/lib/use-oscar";
import { answerLine } from "@/components/preference-card";

/** The most Oscar may do for this sender and action, in words. */
function limitFor(row: AutonomyRow | undefined, decision: Decision) {
  if (decision.autonomy_level === "ESCALATE" || row?.floor === "ESCALATE") return "Never acts on his own";
  if (row?.floor === "ASK_FIRST") return "Always asks first";
  if (row?.ceiling) return `Up to ${STATUS[row.ceiling].label}`;
  return "Can handle it on his own";
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/**
 * "Why Oscar did this": facts about a decision, from the decision itself, the
 * protected rules, and what Oscar has learned. Not the model's reasoning.
 */
export function WhyDrawer() {
  const { data } = useOscar();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => onOpenWhy(setId), []);
  const close = useCallback(() => setId(null), []);

  const decision = data?.items.find((i) => i.decision.id === id)?.decision;
  const learned: LearnedRow | undefined = decision && data?.learned.find((r) => r.sender === decision.sender && r.action === decision.action);
  const limit: AutonomyRow | undefined = decision && data?.autonomy.find((r) => r.sender === decision.sender && r.action === decision.action);
  const answers = decision && data ? answersFor(data.all, decision.sender, decision.action) : null;
  const anyAnswers = !!answers && answers.approved + answers.declined + answers.undone > 0;
  const { risk, reversible } = decision ? riskOf(decision) : { risk: "Low", reversible: true };
  // The first step names the sender and the last is the outcome; both are already shown.
  const checks = decision?.steps.slice(1, -1) ?? [];

  return (
    <Drawer open={!!decision} onClose={close} title={decision && wouldOnly(decision) ? "Why Oscar would do this" : "Why Oscar did this"}>
      {decision && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{decision.sender}</p>
            <p className="font-medium">{decision.subject}</p>
            <StatusPill level={decision.autonomy_level} readOnly={decision.source === "gmail"} className="mt-1 self-start" />
          </div>

          <dl className="divide-y rounded-xl border px-4">
            <Fact label="Action">{ACTIONS[decision.action]}</Fact>
            <Fact label="Risk">{risk}</Fact>
            <Fact label="Reversible">{reversible ? "Yes" : "No"}</Fact>
            <Fact label="Decided by">{LEVEL_SOURCES[decision.level_source]}</Fact>
            <Fact label="Your answers">{answers ? answerLine(answers) : "No answers yet"}</Fact>
            {learned?.always_ask && <Fact label="Your rule">Always ask</Fact>}
            {anyAnswers && learned && !learned.always_ask && (
              <Fact label="Oscar's estimate">{Math.round(learned.mean * 100)}% you&apos;re fine with it</Fact>
            )}
            <Fact label="Safety limit">{limitFor(limit, decision)}</Fact>
          </dl>

          {checks.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">What I checked</h3>
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {checks.map((step) => (
                  <li key={step} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
                    {step}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {decision.safety_flags.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ShieldIcon className="size-4 text-status-blocked" /> Safety checks
              </h3>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {decision.safety_flags.map((f) => (
                  <li key={f}>{FLAGS[f] ?? f}</li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            These are the rules and feedback behind the decision. Protected rules can&apos;t be changed by feedback.
          </p>
        </div>
      )}
    </Drawer>
  );
}
