"use client";

import { useState } from "react";
import { DecisionCard } from "@/components/decision-card";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader, Section } from "@/components/page";
import { RealInboxResults } from "@/components/real-inbox-results";
import { Button } from "@/components/ui/button";
import { checkGmail } from "@/lib/demo";
import { useOscar } from "@/lib/use-oscar";

/** Going through Oscar's decisions on the real inbox and saying how he did. */
export function ReviewPage() {
  const { data, error, feedback } = useOscar();
  const [showReviewed, setShowReviewed] = useState(false);
  if (!data) {
    return (
      <Page>
        <Loading error={error} />
      </Page>
    );
  }

  const real = data.items.filter((i) => i.decision.source === "gmail");
  const toReview = real.filter((i) => !i.review);
  const reviewed = real.filter((i) => i.review);

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Review"
        text="Oscar only reads your inbox for now. Say how he would have done; it measures him, he doesn't learn from it."
      >
        {data.gmail.connected && (
          <Button size="sm" variant="outline" onClick={checkGmail}>
            Check for new email
          </Button>
        )}
      </PageHeader>

      {real.length > 0 && <RealInboxResults summary={data.reviews} />}

      {!data.gmail.connected && !real.length && (
        <EmptyState title="Gmail isn't connected." text="Connect it in Settings and Oscar will start reading your inbox." />
      )}
      {data.gmail.connected && !real.length && (
        <EmptyState title="Nothing read yet." text="Check for new email and Oscar will read your inbox.">
          <Button onClick={checkGmail}>Check for new email</Button>
        </EmptyState>
      )}

      {toReview.length > 0 && (
        <Section title={`To review (${toReview.length})`}>
          <ul className="flex flex-col gap-3">
            {toReview.map((item) => (
              <li key={item.decision.id}>
                <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {reviewed.length > 0 && (
        <Section title={`Reviewed (${reviewed.length})`}>
          {showReviewed ? (
            <ul className="flex flex-col gap-3">
              {reviewed.map((item) => (
                <li key={item.decision.id}>
                  <DecisionCard compact item={item} onFeedback={(k, t) => feedback(item.decision.id, k, t)} />
                </li>
              ))}
            </ul>
          ) : (
            <button
              type="button"
              onClick={() => setShowReviewed(true)}
              className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Show the ones you&apos;ve reviewed
            </button>
          )}
        </Section>
      )}
    </Page>
  );
}
