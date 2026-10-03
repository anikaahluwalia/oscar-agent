"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BaselineTable } from "@/components/evals/baseline-table";
import { HowToRun } from "@/components/evals/how-to-run";
import { InterruptionsChart } from "@/components/evals/interruptions-chart";
import { LatestRun } from "@/components/evals/latest-run";
import { MetricTiles } from "@/components/evals/metric-tiles";
import { RunDetails } from "@/components/evals/run-details";
import { defaultSetup, latestSet, type Setup } from "@/components/evals/runs";
import { Panel } from "@/components/kit/panel";
import { Page, PageHeader } from "@/components/page";
import { RealInboxResults } from "@/components/real-inbox-results";
import { getEvalRun, getEvalRuns, type EvalCaseResult, type EvalRun } from "@/lib/api";
import { useOscar } from "@/lib/use-oscar";

/**
 * Fetches a run's per-case results once and keeps them, so switching setups doesn't refetch.
 * Gives undefined while loading and null if the run couldn't be fetched.
 */
function useCases(runIds: (string | undefined)[]) {
  const [cases, setCases] = useState<Record<string, EvalCaseResult[] | null>>({});
  const key = runIds.filter(Boolean).join("|");
  useEffect(() => {
    let live = true;
    key.split("|")
      .filter((id) => id && !cases[id])
      .forEach((id) =>
        getEvalRun(id).then(
          (run) => live && setCases((c) => ({ ...c, [id]: run.cases ?? [] })),
          () => live && setCases((c) => ({ ...c, [id]: null })),
        ),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch only for run ids we haven't got yet
  }, [key]);
  return (id?: string): EvalCaseResult[] | null | undefined => (id ? cases[id] : undefined);
}

/** Oscar tested on realistic emails he never saw, from saved runs. Your reviews of the real inbox sit apart, below. */
export function EvalsPage() {
  const { data } = useOscar();
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [problem, setProblem] = useState(false);
  const [picked, setPicked] = useState<Setup | null>(null);

  useEffect(() => {
    getEvalRuns().then(setRuns, () => setProblem(true));
  }, []);

  const sets = useMemo(() => (runs ? { rules: latestSet(runs, "rules"), model: latestSet(runs, "model") } : null), [runs]);
  const setups = sets ? (["model", "rules"] as Setup[]).filter((s) => sets[s]?.heldoutAfter) : [];
  const setup = picked && setups.includes(picked) ? picked : runs ? defaultSetup(runs) : null;
  const set = sets && setup ? sets[setup] : null;
  const held = set?.heldoutAfter;
  const casesOf = useCases([held?.run_id, set?.safetyAfter?.run_id]);
  const heldoutCases = casesOf(held?.run_id);
  const safetyCases = casesOf(set?.safetyAfter?.run_id);

  return (
    <Page>
      <PageHeader title="Evals" text="Oscar tested on realistic emails he never saw. Every number comes from a saved test run.">
        <HowToRun />
      </PageHeader>

      {problem && <p className="text-sm text-muted-foreground">I can&apos;t reach my API, so there are no test results to show.</p>}
      {!runs && !problem && <p className="text-sm text-muted-foreground">Fetching the saved test runs...</p>}
      {runs && !held && (
        <Panel>
          <p className="text-sm text-muted-foreground">No test runs saved yet. Use How to run above, then come back.</p>
        </Panel>
      )}

      {runs && set && held && (
        <>
          <LatestRun set={set} setups={setups} onSetup={setPicked} />
          <section aria-label="Results after learning" className="flex flex-col gap-2">
            <MetricTiles heldout={held} safety={set.safetyAfter} safetyCases={safetyCases} />
            <p className="text-xs text-muted-foreground">
              Held-out emails after learning, except injection attempts, which come from the safety test.
            </p>
          </section>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <InterruptionsChart before={set.heldoutBefore} after={held} />
            <BaselineTable all={runs} heldout={held.dataset.name} />
          </div>
          <RunDetails set={set} heldoutCases={heldoutCases} safetyCases={safetyCases} />
        </>
      )}

      <section aria-labelledby="real-inbox" className="flex flex-col gap-4 border-t pt-8">
        <div className="flex flex-col gap-1">
          <h2 id="real-inbox" className="text-2xl font-semibold tracking-tight">
            On your real inbox
          </h2>
          <p className="text-muted-foreground">From your reviews of Oscar&apos;s calls on your Gmail. Kept apart from the test results above.</p>
        </div>
        {!data ? (
          <p className="text-sm text-muted-foreground">Checking your inbox...</p>
        ) : data.reviews.reviewed ? (
          <RealInboxResults summary={data.reviews} />
        ) : !data.gmail.connected ? (
          <Panel>
            <p className="text-sm text-muted-foreground">
              Gmail isn&apos;t connected, so there are no real-inbox results yet. Connect it in{" "}
              <Link href="/settings" className="font-medium text-primary underline-offset-4 hover:underline">
                Settings
              </Link>
              .
            </p>
          </Panel>
        ) : (
          <Panel>
            <p className="text-sm text-muted-foreground">
              No reviews yet. Check a few of his calls on the{" "}
              <Link href="/review" className="font-medium text-primary underline-offset-4 hover:underline">
                Review
              </Link>{" "}
              page.
            </p>
          </Panel>
        )}
      </section>
    </Page>
  );
}
