"use client";

import { useEffect, useMemo, useState } from "react";
import { AskRate } from "@/components/doing/ask-rate";
import { DifferenceTable } from "@/components/doing/difference-table";
import { Disclosure } from "@/components/doing/disclosure";
import { Headline } from "@/components/doing/headline";
import { HowToRun } from "@/components/doing/how-to-run";
import { Impact } from "@/components/doing/impact";
import { RealInboxResults } from "@/components/doing/real-results";
import { leadRun } from "@/components/doing/runs";
import { Tests } from "@/components/doing/tests";
import { MoodHeader } from "@/components/kit/mood-header";
import { Panel } from "@/components/kit/panel";
import { Loading, Page } from "@/components/page";
import { getEvalRuns, type EvalRun } from "@/lib/api";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

/** The time now, updated every minute, so "last 24 hours" stays right. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * How Oscar is doing: tested on emails he never saw (saved runs under evals/results), and checked
 * against your reviews of his calls on your real inbox. The test numbers and your numbers stay apart.
 */
export function DoingPage() {
  const { data, error } = useOscar();
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [problem, setProblem] = useState(false);
  const now = useNow();

  useEffect(() => {
    getEvalRuns().then(setRuns, () => setProblem(true));
  }, []);

  const lead = useMemo(() => (runs ? leadRun(runs) : null), [runs]);
  // Proud only when the latest test acted on no risky email.
  const proud = lead ? (lead.held.metrics.critical_violations ?? 0) === 0 : false;

  return (
    <Page className="sm:pt-12">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-9">
        <MoodHeader
          pose={proud ? "proud" : "thinking"}
          title="How I'm doing"
          text="Tested on emails I'd never seen, and checked against your answers."
        />

        {problem && <p className="text-sm text-muted-foreground">I can&apos;t reach my API, so there are no test results to show.</p>}
        {!runs && !problem && <p className="text-sm text-muted-foreground">Fetching the saved test runs...</p>}
        {runs && !lead && (
          <Panel>
            <p className="text-sm text-muted-foreground">No test runs saved yet. Open How to run the tests, at the bottom, then come back.</p>
          </Panel>
        )}

        {runs && lead && (
          <>
            <Headline all={runs} held={lead.held} reviews={data?.reviews} connected={data?.gmail.connected} />
            <DifferenceTable all={runs} heldout={lead.held.dataset.name} />
            <Disclosure label="See every test, and the ones I got wrong" className="-mt-3">
              <Tests all={runs} />
            </Disclosure>
          </>
        )}

        <section aria-labelledby="real" className="flex flex-col gap-4 border-t pt-8">
          <div className="flex flex-col gap-1">
            <h2 id="real" className="text-lg font-semibold">
              On the emails I&apos;ve read
            </h2>
            <p className="text-sm text-muted-foreground">
              {data?.gmail.connected ? "From my calls on your inbox, not the tests." : "From the example emails I've read, not the tests."}
            </p>
          </div>
          {!data ? (
            <Loading error={error} />
          ) : data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">I haven&apos;t read any emails yet, so there&apos;s nothing to show here.</p>
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <AskRate items={data.items} readOnly={isReadOnly(data)} />
              <Impact items={data.items} readOnly={isReadOnly(data)} now={now} />
            </div>
          )}
          {data && data.reviews.reviewed > 0 && (
            <Disclosure label="How you graded me">
              <RealInboxResults summary={data.reviews} />
            </Disclosure>
          )}
        </section>

        <Disclosure label="How to run the tests" className="-mt-4">
          <HowToRun />
        </Disclosure>
      </div>
    </Page>
  );
}
