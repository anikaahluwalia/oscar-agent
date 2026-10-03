"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/kit/panel";
import { Stat } from "@/components/kit/stat";
import { getEvalRun, type EvalCaseResult, type EvalRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { InterruptionsChart } from "./interruptions-chart";
import { RunDetails } from "./run-details";
import { defaultSetup, injection, latestSet, outOf, pct, setupText, when, type RunSet, type Setup } from "./runs";

const SETUPS: { key: Setup; label: string }[] = [
  { key: "model", label: "Reading the email" },
  { key: "rules", label: "Rules only" },
];

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

/** When the run was, what it tested, and the numbers that didn't make the top of the page. */
function LatestRun({ set, safetyCases }: { set: RunSet; safetyCases?: EvalCaseResult[] | null }) {
  const run = set.heldoutAfter!;
  const m = run.metrics;
  const safety = set.safetyAfter;
  const inj = injection(safetyCases);
  return (
    <Panel title="The latest run">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat value={<span className="text-lg">{when(run.created_at)}</span>} label="When" note={<>commit <code className="font-mono">{run.versions.commit}</code></>} />
        <Stat value={run.dataset.cases} label="Held-out emails" note={<code className="font-mono">{run.dataset.name}</code>} />
        <Stat
          value={safety?.dataset.cases ?? "n/a"}
          label="Safety test emails"
          note={set.regression ? `plus ${set.regression.dataset.cases} from past mistakes on your inbox` : undefined}
        />
        <Stat value={<span className="text-lg">{run.versions.understanding ? "Yes" : "No"}</span>} label="Model read the emails" note={setupText(run)} />
        <Stat
          value={pct(m.too_permissive_rate)}
          label="Acted when he should have waited"
          note={outOf(m.too_permissive_rate, m.n?.careful) ? `${outOf(m.too_permissive_rate, m.n?.careful)} that needed you` : undefined}
        />
        {inj ? (
          <Stat
            tone={inj.caught === inj.of ? "handled" : "blocked"}
            value={pct(inj.rate)}
            label="Injection attempts caught"
            note={`${inj.caught} of ${inj.of} in the safety test`}
          />
        ) : (
          <Stat
            value={!safety ? "n/a" : safetyCases === undefined ? "..." : pct(safety.metrics.safety_recall)}
            label="Risky emails caught"
            note={
              !safety
                ? "No safety test saved"
                : safetyCases === undefined
                  ? "Loading the safety test"
                  : safetyCases === null
                    ? "Couldn't load the safety test emails, so this is every risky one"
                    : "No injection attempts in this run, so this is every risky email"
            }
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        He never saw these emails while being built.
        {run.learning && (
          <>
            {" "}
            Before the &ldquo;after learning&rdquo; scores, he learned from {run.learning.emails} other made-up emails ({run.learning.feedback} pieces of feedback from a
            pretend user), never from the test ones.
          </>
        )}
      </p>
    </Panel>
  );
}

/** Everything behind the top of the page: the latest run, every test, and where he went wrong. */
export function Tests({ all }: { all: EvalRun[] }) {
  const [picked, setPicked] = useState<Setup | null>(null);
  const sets = useMemo(() => ({ rules: latestSet(all, "rules"), model: latestSet(all, "model") }), [all]);
  const setups = (["model", "rules"] as Setup[]).filter((s) => sets[s]?.heldoutAfter);
  const setup = picked && setups.includes(picked) ? picked : defaultSetup(all);
  const set = setup ? sets[setup] : null;
  const casesOf = useCases([set?.heldoutAfter?.run_id, set?.safetyAfter?.run_id]);
  if (!set?.heldoutAfter) return null;
  const heldoutCases = casesOf(set.heldoutAfter.run_id);
  const safetyCases = casesOf(set.safetyAfter?.run_id);

  return (
    <div className="flex flex-col gap-6">
      {setups.length > 1 && (
        <div role="group" aria-label="Which Oscar" className="flex self-start rounded-full border bg-muted p-0.5">
          {SETUPS.filter((s) => setups.includes(s.key)).map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={set.setup === s.key}
              onClick={() => setPicked(s.key)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                set.setup === s.key && "bg-card text-foreground shadow-card",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <LatestRun set={set} safetyCases={safetyCases} />
      <RunDetails set={set} heldoutCases={heldoutCases} safetyCases={safetyCases} />
      <InterruptionsChart before={set.heldoutBefore} after={set.heldoutAfter} />
    </div>
  );
}
