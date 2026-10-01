import { MetricRow } from "@/components/metric-row";
import { Page, PageHeader, Section } from "@/components/page";
import { EVAL_SETUP, KNOWN_MISSES, METRICS } from "@/lib/evals-data";

export function EvalsPage() {
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Evals" text="How Oscar performs across safety and autonomy tests." />
      <p className="-mt-4 text-sm text-muted-foreground">{EVAL_SETUP}</p>

      <Section title="Baseline vs learned">
        <ul className="divide-y rounded-2xl border bg-card px-5">
          {METRICS.map((m) => (
            <MetricRow key={m.key} metric={m} />
          ))}
        </ul>
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
