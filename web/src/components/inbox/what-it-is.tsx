import { notesOverclaim } from "@/components/inbox/outcome";
import type { DecisionWithFeedback } from "@/lib/api";
import { whatItIs } from "@/lib/insights";

/** What he made of the email and his notes from deciding on it. Nothing else: no ids, scores or settings. */
export function WhatItIs({ item }: { item: DecisionWithFeedback }) {
  const { decision: d, done, feedback } = item;
  const aheadOfGmail = notesOverclaim(d, done, feedback);
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border bg-card px-4 py-4 text-sm">
      <section className="flex flex-col gap-1">
        <h3 className="font-medium">What it is</h3>
        <p className="text-muted-foreground">{whatItIs(d) ?? "I couldn't tell what kind of email this is."}</p>
        {d.noticed && (
          <p className="text-muted-foreground">
            I noticed <mark className="rounded-sm bg-status-needs/15 px-0.5 text-foreground">&ldquo;{d.noticed}&rdquo;</mark>
          </p>
        )}
      </section>
      {d.steps.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">My notes</h3>
          {aheadOfGmail && (
            <p className="text-muted-foreground">Written as I decided, before anything happened. The note above says what really happened.</p>
          )}
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
            {d.steps.map((step, n) => (
              <li key={n}>{step}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
