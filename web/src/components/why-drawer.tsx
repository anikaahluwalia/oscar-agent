"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldIcon } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { isRule, ruleLine } from "@/components/inbox/decision-facts";
import { Checklist } from "@/components/kit/checklist";
import { StatusPill } from "@/components/status-pill";
import type { Action, AutonomyRow, Decision, DecisionWithFeedback, Level } from "@/lib/api";
import { onOpenWhy } from "@/lib/drawers";
import { safetyChecks } from "@/lib/insights";
import { ACTIONS, LEVEL_SOURCES, STATUS, typeName, typeOf, wouldOnly } from "@/lib/labels";
import { answersFor, useOscar, type Answers } from "@/lib/use-oscar";

/** "Approved 3 · declined 1": how you've actually answered, counted from your feedback. */
function answerLine(a: Answers) {
  const parts = [a.approved && `approved ${a.approved}`, a.declined && `declined ${a.declined}`, a.undone && `undone ${a.undone}`].filter(Boolean);
  if (!parts.length) return "No answers yet";
  const line = parts.join(" · ");
  return line[0].toUpperCase() + line.slice(1);
}

/** The most Oscar may do for this sender and action, in words. */
function limitFor(row: AutonomyRow | undefined, decision: Decision) {
  if (decision.autonomy_level === "ESCALATE" || row?.floor === "ESCALATE") return "Never acts on his own";
  if (row?.floor === "ASK_FIRST") return "Always asks first";
  if (row?.ceiling) return `Up to ${STATUS[row.ceiling].label}`;
  return "Can handle it on his own";
}

const FLOOR_WORDS: Record<string, string> = {
  ESCALATE: "Never acts on his own",
  ASK_FIRST: "Always asks first",
  PROCEED_AND_NOTIFY: "Always tells you",
  PROCEED_SILENTLY: "Can handle it on his own",
};

/** How much he involved you, in words. */
const AUTONOMY: Record<Level, [string, string]> = {
  PROCEED_SILENTLY: ["Handled silently", "Would handle it silently"],
  PROCEED_AND_NOTIFY: ["Handled, and told you", "Would handle it and tell you"],
  ASK_FIRST: ["Asked you first", "Would ask you first"],
  ESCALATE: ["Stopped, did nothing", "Would stop and do nothing"],
};

// Actions whose effect reaches past your inbox: someone else sees it, or it can't be taken back there.
const EXTERNAL = new Set<Action>(["SEND_REPLY", "FORWARD", "UNSUBSCRIBE", "ACCEPT_MEETING", "SEND_CREDENTIALS", "MOVE_MONEY"]);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** What kind of email it is, and who said so. */
function classification(item: DecisionWithFeedback) {
  const name = typeName(typeOf(item));
  if (item.classification) return `${name} (you said so; I read it as ${typeName(item.classification.original_type).toLowerCase()})`;
  if (item.decision.type_from_you) return `${name} (from what you said about this sender)`;
  return name;
}

/**
 * "Why Oscar did this": the state of a decision as structured facts, from the decision itself, the
 * protected rules, and what Oscar has learned. Classification, action, autonomy, the rule, what it
 * rests on, then the safety checks. Never the model's reasoning or his working notes.
 */
export function WhyDrawer() {
  const { data } = useOscar();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => onOpenWhy(setId), []);
  const close = useCallback(() => setId(null), []);

  const item = data?.items.find((i) => i.decision.id === id);
  const decision = item?.decision;
  const limit: AutonomyRow | undefined = decision && data?.autonomy.find((r) => r.sender === decision.sender && r.action === decision.action);
  const answers = decision && data ? answersFor(data.all, decision.sender, decision.action) : null;
  const would = !!decision && wouldOnly(decision);
  const rule = decision ? ruleLine(decision) : null;
  const checks = decision
    ? [{ label: "No effect outside your inbox", ok: !EXTERNAL.has(decision.action) }, ...safetyChecks(decision)]
    : [];

  return (
    <Drawer open={!!decision} onClose={close} title={would ? "Why Oscar would do this" : "Why Oscar did this"}>
      {item && decision && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{decision.sender}</p>
            <p className="font-medium">{decision.subject}</p>
            <StatusPill level={decision.autonomy_level} readOnly={decision.source === "gmail"} className="mt-1 self-start" />
          </div>

          <dl className="divide-y rounded-xl border px-4">
            <Fact label="Classification">{classification(item)}</Fact>
            <Fact label="Action">{ACTIONS[decision.action]}</Fact>
            <Fact label="Autonomy">{AUTONOMY[decision.autonomy_level][would ? 1 : 0]}</Fact>
            <Fact label="Rule used">{rule ?? (decision.safety_rule ? `Safety: ${decision.safety_rule}` : LEVEL_SOURCES[decision.level_source])}</Fact>
            <Fact label="Evidence">
              {decision.preference
                ? isRule(decision)
                  ? "You taught me this explicitly"
                  : `${Math.round(decision.preference.evidence)} of your answers, ${Math.round(decision.preference.confidence * 100)}% sure`
                : decision.safety_rule
                  ? "A protected rule, not something learned"
                  : answers
                    ? answerLine(answers)
                    : "No answers yet"}
            </Fact>
            <Fact label="Safety limit">{decision.safety_floor ? FLOOR_WORDS[decision.safety_floor] : limitFor(limit, decision)}</Fact>
          </dl>

          <section className="flex flex-col gap-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldIcon className="size-4 text-muted-foreground" aria-hidden /> Safety
            </h3>
            <Checklist items={checks} />
          </section>

          {!!decision.factors?.length && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">What mattered</h3>
              <ul aria-label="What mattered" className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {decision.factors.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {f}
                  </li>
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
