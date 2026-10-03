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
import { YourEmail } from "@/components/doing/your-email";
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

  const graded = data?.reviews.graded;
  const real = data?.gmail.connected && graded && "passed" in graded && graded.n > 0 ? graded : null;
  // On your email: proud once most of my calls are right and none went too far; until then, learning.
  const pose = real
    ? real.passed / real.n >= 0.8 && real.acted_when_you_would_stop === 0 ? "proud" : "learning"
    : proud ? "proud" : "thinking";

  return (
    <Page className="sm:pt-12">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-9">
        <MoodHeader pose={pose} title="My progress" text="How I'm doing on your Gmail, from the calls you've checked." />

        {!data ? (
          <Loading error={error} />
        ) : (
          <>
            <YourEmail reviews={data.reviews} items={data.items} connected={data.gmail.connected} />
            {data.items.length > 0 && (
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <AskRate items={data.items} readOnly={isReadOnly(data)} />
                <Impact items={data.items} readOnly={isReadOnly(data)} now={now} />
              </div>
            )}
            {data.reviews.reviewed > 0 && (
              <Disclosure label="How you graded me" className="-mt-3">
                <RealInboxResults summary={data.reviews} />
              </Disclosure>
            )}
          </>
        )}

        <section aria-labelledby="tests" className="flex flex-col gap-6 border-t pt-8">
          <div className="flex flex-col gap-1">
            <h2 id="tests" className="text-lg font-semibold">
              On test emails I&apos;d never seen
            </h2>
            <p className="text-sm text-muted-foreground">
              Made-up emails, the same ones each time, so every change to me is measured the same way.
            </p>
          </div>
          {problem && <p className="text-sm text-muted-foreground">I can&apos;t reach my API, so there are no test results to show.</p>}
          {!runs && !problem && <p className="text-sm text-muted-foreground">Fetching the saved test runs...</p>}
          {runs && !lead && (
            <Panel>
              <p className="text-sm text-muted-foreground">No test runs saved yet. Open How to run the tests, at the bottom, then come back.</p>
            </Panel>
          )}
          {runs && lead && (
            <>
              <Headline all={runs} held={lead.held} />
              <DifferenceTable all={runs} heldout={lead.held.dataset.name} />
              <Disclosure label="See every test, and the ones I got wrong" className="-mt-3">
                <Tests all={runs} />
              </Disclosure>
            </>
          )}
        </section>

        <Disclosure label="How to run the tests" className="-mt-4">
          <HowToRun />
        </Disclosure>
      </div>
    </Page>
  );
}
