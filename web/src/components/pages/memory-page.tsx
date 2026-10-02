"use client";

import { useState } from "react";
import { Loading, Page, PageHeader, Section } from "@/components/page";
import { PreferenceCard, PreferenceControls } from "@/components/preference-card";
import { ProtectedRuleCard } from "@/components/protected-rule-card";
import type { FeedbackKind } from "@/lib/api";
import { ACTIONS, PROTECTED_RULES } from "@/lib/labels";
import { answersFor, useOscar } from "@/lib/use-oscar";

export function MemoryPage() {
  const { data, error, feedback } = useOscar();
  const [showAll, setShowAll] = useState(false);

  const tell = (decisionId: string, kind: FeedbackKind) => void feedback(decisionId, kind);
  // On the real inbox Oscar only reads for now, so there's nothing to teach him there yet.
  const readOnly = !!data?.gmail.connected;

  const limitsFor = (sender: string, action: string) => data?.autonomy.find((r) => r.sender === sender && r.action === action);
  const learnedKeys = new Set(data?.learned.map((r) => `${r.sender}|${r.action}`));
  const others = (data?.autonomy ?? []).filter((r) => r.floor !== "ESCALATE" && !learnedKeys.has(`${r.sender}|${r.action}`));

  return (
    <Page className="max-w-3xl">
      <PageHeader title="What Oscar Knows" text="Preferences Oscar has learned from how you work." />
      {readOnly && (
        <p className="-mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          Oscar only reads your real inbox for now, so he isn&apos;t learning from it yet. Your reviews measure him instead.
        </p>
      )}
      {!data && <Loading error={error} />}

      {data && (
        <Section title="Learned preferences">
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
              Nothing yet. Every approve, decline and undo teaches Oscar a little about how you work.
            </p>
          )}
        </Section>
      )}

      {data && !readOnly && others.length > 0 && (
        <Section title="Other senders">
          {showAll ? (
            <ul className="flex flex-col gap-3">
              {others.map((row) => (
                <li key={`${row.sender}-${row.action}`} className="flex flex-col gap-3 rounded-2xl border bg-card shadow-card p-4">
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
          )}
        </Section>
      )}

      <Section title="Protected rules">
        <p className="-mt-1 text-sm text-muted-foreground">These never change, no matter what Oscar learns.</p>
        <ul className="flex flex-col gap-3">
          {PROTECTED_RULES.map((rule) => (
            <ProtectedRuleCard key={rule.title} rule={rule} />
          ))}
        </ul>
      </Section>
    </Page>
  );
}
