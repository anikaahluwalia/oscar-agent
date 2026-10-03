"use client";

import { RefreshCwIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Loading, Page, PageHeader } from "@/components/page";
import { ReviewStats } from "@/components/review/review-stats";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { Button } from "@/components/ui/button";
import { bringInDemo, checkGmail } from "@/lib/demo";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

/**
 * Review: every email Oscar has decided on, with what needs you first. You approve or decline
 * his asks, undo what he did, and on your real inbox grade each call, which teaches him.
 */
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
  const readOnly = isReadOnly(data);
  // Your Gmail once it's connected; until then, the demo inbox.
  const items = data.items.filter((i) => i.decision.source === (real ? "gmail" : "demo"));

  return (
    <Page className="max-w-[90rem] gap-6">
      <PageHeader
        title="Review"
        text={
          readOnly
            ? "Check Oscar's calls on your inbox. Each answer teaches him what you'd do."
            : "Review Oscar's decisions and teach him what you'd do."
        }
      >
        {real && (
          <Button variant="outline" className="h-11 sm:h-9" onClick={checkGmail}>
            <RefreshCwIcon /> Check now
          </Button>
        )}
      </PageHeader>

      {items.length ? (
        <ReviewWorkspace
          items={items}
          real={real}
          readOnly={readOnly}
          canAct={real && data.gmail.acting}
          feedback={feedback}
          stats={<ReviewStats data={data} items={items} />}
        />
      ) : real ? (
        <EmptyState
          title="Nothing read yet."
          text={
            data.gmail.auto_check_minutes
              ? `Oscar checks your inbox every ${data.gmail.auto_check_minutes} ${data.gmail.auto_check_minutes === 1 ? "minute" : "minutes"}, or you can ask him now.`
              : "Oscar checks your inbox when you ask him to."
          }
          mood="sleepy"
        >
          <Button onClick={checkGmail}>Check now</Button>
        </EmptyState>
      ) : (
        <EmptyState title="No emails yet." text="Bring in the demo emails to see what Oscar does with them, and teach him what you'd do." mood="sleepy">
          <Button onClick={bringInDemo}>Bring in the demo emails</Button>
        </EmptyState>
      )}
    </Page>
  );
}
