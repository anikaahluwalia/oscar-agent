"use client";

import { DecisionCard } from "@/components/decision-card";
import { EmptyState } from "@/components/empty-state";
import { OscarAvatar } from "@/components/oscar-avatar";
import { Loading, Page, PageHeader, Section } from "@/components/page";
import { ReviewStats } from "@/components/review/review-stats";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { Button } from "@/components/ui/button";
import type { DecisionWithFeedback } from "@/lib/api";
import { checkGmail } from "@/lib/demo";
import { needsReview } from "@/lib/labels";
import { isOpen, isUnchecked, useOscar, type OscarData } from "@/lib/use-oscar";

type Feedback = ReturnType<typeof useOscar>["feedback"];

function Cards({ items, feedback }: { items: DecisionWithFeedback[]; feedback: Feedback }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.decision.id}>
          <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
        </li>
      ))}
    </ul>
  );
}

/** What Oscar asked you about or stopped, and what he did and told you about. */
function WaitingOnYou({ data, feedback }: { data: OscarData; feedback: Feedback }) {
  const readOnly = data.gmail.connected;
  const open = data.items.filter(isOpen);
  const asks = open.filter((i) => i.decision.autonomy_level === "ASK_FIRST");
  const stopped = open.filter((i) => i.decision.autonomy_level === "ESCALATE");
  const told = data.items.filter(isUnchecked);

  if (!open.length && !told.length) {
    return <EmptyState title="All clear!" text="When Oscar needs a yes or stops something, it shows up here." mood="sleepy" />;
  }
  return (
    <div className="flex flex-col gap-8">
      {stopped.length > 0 && (
        <Section title={readOnly ? "He'd stop these" : "Oscar stopped these"}>
          <Cards items={stopped} feedback={feedback} />
        </Section>
      )}
      {asks.length > 0 && (
        <Section title={readOnly ? "He'd ask you about these" : "Waiting for your okay"}>
          <Cards items={asks} feedback={feedback} />
        </Section>
      )}
      {told.length > 0 && (
        <Section title={readOnly ? "He'd tell you about these" : "Worth a look"}>
          <p className="-mt-1 text-sm text-muted-foreground">
            {readOnly ? "He'd do these on his own and let you know." : "Oscar did these and told you. Check them or undo them."}
          </p>
          <Cards items={told} feedback={feedback} />
        </Section>
      )}
    </div>
  );
}

/** Everything waiting on you. On the real inbox, the workspace for checking Oscar's calls. */
export function ReviewPage() {
  const { data, error, feedback } = useOscar();
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  if (!data.gmail.connected) {
    return (
      <Page className="max-w-3xl">
        <PageHeader title="Review" />
        <WaitingOnYou data={data} feedback={feedback} />
      </Page>
    );
  }

  const real = data.items.filter((i) => i.decision.source === "gmail");
  const waiting = real.filter(needsReview).length;
  return (
    <Page className="max-w-7xl gap-6">
      <header className="flex flex-wrap items-center gap-5">
        <OscarAvatar size={72} mood={waiting ? "curious" : "sleepy"} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {waiting ? `Help Oscar with ${waiting.toLocaleString()} ${waiting === 1 ? "call" : "calls"}.` : "All checked!"}
          </h1>
          <p className="text-muted-foreground">Each answer grades him and teaches him about that sender.</p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={checkGmail}>
          Check Gmail now
        </Button>
      </header>
      {real.length ? (
        <>
          <ReviewStats data={data} />
          <ReviewWorkspace items={real} />
        </>
      ) : (
        <EmptyState title="Nothing read yet." text="Oscar checks your inbox every few minutes, or press Check Gmail now.">
          <Button onClick={checkGmail}>Check Gmail now</Button>
        </EmptyState>
      )}
    </Page>
  );
}
