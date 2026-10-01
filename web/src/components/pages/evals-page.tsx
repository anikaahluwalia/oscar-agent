"use client";

import Link from "next/link";
import { MetricRow } from "@/components/metric-row";
import { RealInboxResults } from "@/components/real-inbox-results";
import { Page, PageHeader, Section } from "@/components/page";
import { EVAL_SETUP, KNOWN_MISSES, METRICS } from "@/lib/evals-data";
import { useOscar } from "@/lib/use-oscar";

export function EvalsPage() {
  const { data } = useOscar();
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Evals" text="How Oscar performs across safety and autonomy tests." />
      <p className="-mt-4 text-sm text-muted-foreground">{EVAL_SETUP}</p>

      <Section title="Synthetic evals: baseline vs learned">
        <ul className="divide-y rounded-2xl border bg-card px-5">
          {METRICS.map((m) => (
            <MetricRow key={m.key} metric={m} />
          ))}
        </ul>
      </Section>

      <Section title="Real inbox">
        <p className="-mt-1 text-sm text-muted-foreground">
          From your reviews of Oscar&apos;s decisions on your Gmail, which he only reads. Mistakes here become synthetic
          regression tests before Oscar changes.
        </p>
        {data?.reviews.decisions ? (
          <RealInboxResults summary={data.reviews} />
        ) : (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            No real-inbox results yet. Connect Gmail in{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Settings
            </Link>{" "}
            and review a few of Oscar&apos;s decisions.
          </p>
        )}
      </Section>

      <Section title="Where Oscar still gets it wrong">
        <ul className="flex flex-col gap-2">
          {KNOWN_MISSES.map((m) => (
            <li key={m.kind} className="rounded-2xl border bg-card p-4 text-sm">
              <span className="font-medium">{m.kind}.</span> <span className="text-muted-foreground">{m.what}</span>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
