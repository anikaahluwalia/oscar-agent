"use client";

import { useState } from "react";
import { DecisionCard } from "@/components/decision-card";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DecisionWithFeedback } from "@/lib/api";
import { checkGmail } from "@/lib/demo";
import { isOldWay } from "@/lib/labels";
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

/** A section that starts folded, for lists you don't need every time. */
function Folded({ title, show, children }: { title: string; show: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Section title={title}>
      {open ? (
        children
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {show}
        </button>
      )}
    </Section>
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

/** Grading Oscar's decisions on the real inbox, which he only reads. */
function CheckHisCalls({ data, feedback }: { data: OscarData; feedback: Feedback }) {
  const real = data.items.filter((i) => i.decision.source === "gmail");
  const toReview = real.filter((i) => !i.review);
  const oldWay = real.filter((i) => isOldWay(i.review));
  const reviewed = real.filter((i) => i.review && !isOldWay(i.review));

  if (!real.length) {
    return (
      <EmptyState title="Nothing read yet." text="Oscar checks your inbox every few minutes, or press Check now.">
        <Button onClick={checkGmail}>Check now</Button>
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">This grades Oscar. He doesn&apos;t learn from it.</p>
      {toReview.length > 0 ? (
        <Section title={`To review (${toReview.length})`}>
          <Cards items={toReview} feedback={feedback} />
        </Section>
      ) : (
        !oldWay.length && <EmptyState title="All checked!" text="New emails show up here as Oscar reads them." mood="sleepy" />
      )}
      {oldWay.length > 0 && (
        <Folded title={`Finish these (${oldWay.length})`} show="Show them">
          <p className="text-sm text-muted-foreground">The old review screen only saved half of your answer.</p>
          <Cards items={oldWay} feedback={feedback} />
        </Folded>
      )}
      {reviewed.length > 0 && (
        <Folded title={`Reviewed (${reviewed.length})`} show="Show the ones you've reviewed">
          <Cards items={reviewed} feedback={feedback} />
        </Folded>
      )}
    </div>
  );
}

/** Everything waiting on you. On the real inbox, also checking Oscar's calls, in its own tab. */
export function ReviewPage() {
  const { data, error, feedback } = useOscar();
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const real = data.gmail.connected;
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Review">
        {real && (
          <Button size="sm" variant="outline" onClick={checkGmail}>
            Check now
          </Button>
        )}
      </PageHeader>
      {real ? (
        <Tabs defaultValue="check" className="gap-6">
          <TabsList>
            <TabsTrigger value="check">Check his calls</TabsTrigger>
            <TabsTrigger value="waiting">Waiting on you</TabsTrigger>
          </TabsList>
          <TabsContent value="check">
            <CheckHisCalls data={data} feedback={feedback} />
          </TabsContent>
          <TabsContent value="waiting">
            <WaitingOnYou data={data} feedback={feedback} />
          </TabsContent>
        </Tabs>
      ) : (
        <WaitingOnYou data={data} feedback={feedback} />
      )}
    </Page>
  );
}
