"use client";

import { DecisionCard } from "@/components/decision-card";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader, Section } from "@/components/page";
import { isOpen, isUnchecked, useOscar } from "@/lib/use-oscar";

export function NeedsYouPage() {
  const { data, error, feedback } = useOscar();
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const open = data.items.filter(isOpen);
  const asks = open.filter((i) => i.decision.autonomy_level === "ASK_FIRST");
  const stopped = open.filter((i) => i.decision.autonomy_level === "ESCALATE");
  const n = open.length;
  const readOnly = data.gmail.connected;
  const told = data.items.filter(isUnchecked);

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Needs You"
        text={
          readOnly
            ? "What Oscar would bring to you. He only reads your inbox for now, so review these instead of answering them."
            : n
              ? `${n} ${n === 1 ? "thing" : "things"} Oscar wants you to review.`
              : "Nothing is waiting on you."
        }
      />
      {n === 0 && !told.length && <EmptyState title="All clear!" text="When Oscar needs a yes or stops something, it shows up here." mood="sleepy" />}

      {asks.length > 0 && (
        <Section title={readOnly ? "He'd ask you about these" : "Waiting for your okay"}>
          <ul className="flex flex-col gap-3">
            {asks.map((item) => (
              <li key={item.decision.id}>
                <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {stopped.length > 0 && (
        <Section title={readOnly ? "He'd stop these" : "Oscar stopped these"}>
          <ul className="flex flex-col gap-3">
            {stopped.map((item) => (
              <li key={item.decision.id}>
                <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {told.length > 0 && (
        <Section title={readOnly ? "He'd tell you about these" : "Worth a look"}>
          <p className="-mt-1 text-sm text-muted-foreground">
            {readOnly ? "He'd do these on his own and let you know." : "Oscar did these and told you. Check them or undo them."}
          </p>
          <ul className="flex flex-col gap-3">
            {told.map((item) => (
              <li key={item.decision.id}>
                <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
