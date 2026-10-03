"use client";

import { useEffect, useState } from "react";
import { Loading, Page } from "@/components/page";
import { MoodHeader } from "@/components/kit/mood-header";
import { HeldBack } from "@/components/promises/held-back";
import { LatestTest } from "@/components/promises/latest-test";
import { PromiseCard } from "@/components/promises/promise-card";
import { PROMISES } from "@/components/promises/promises";
import { latestSafetyRun } from "@/components/promises/record";
import { RecordLine } from "@/components/promises/record-line";
import { getEvalRuns, type EvalRun } from "@/lib/api";
import { safetyEvents } from "@/lib/insights";
import { isReadOnly, useOscar } from "@/lib/use-oscar";

/** The things learning can't change, what they held back, and how they've held up. */
export function PromisesPage() {
  const { data, error } = useOscar();
  const [run, setRun] = useState<EvalRun | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getEvalRuns().then(
      (runs) => live && setRun(latestSafetyRun(runs)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const events = data ? safetyEvents(data.items) : [];
  const readOnly = data ? isReadOnly(data) : false;

  return (
    <Page>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10">
        <MoodHeader
          pose="guarding"
          title="Things I'll never do alone"
          text="These always come to you. Nothing you teach me changes them."
        />

        <section aria-labelledby="promises">
          <h2 id="promises" className="sr-only">
            My promises
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROMISES.map((p) => (
              <PromiseCard key={p.key} promise={p} />
            ))}
          </ul>
        </section>

        {!data ? (
          <Loading error={error} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3.5">
              <HeldBack events={events} total={data.items.length} readOnly={readOnly} />
              <RecordLine data={data} readOnly={readOnly} run={run} />
            </div>
            <LatestTest run={run} failed={failed} />
          </div>
        )}
      </div>
    </Page>
  );
}
