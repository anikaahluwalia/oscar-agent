"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Panel } from "@/components/kit/panel";
import { getEvalRuns, type EvalRun } from "@/lib/api";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The newest saved safety test. Within the newest commit's runs, prefer the one after learning:
 * that's the one that shows learning can't get past the rules. An older run never wins over a newer one.
 */
function pick(runs: EvalRun[]) {
  const safety = runs.filter((r) => r.suite === "safety").sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!safety.length) return null;
  const latest = safety.filter((r) => r.versions.commit === safety[0].versions.commit);
  return latest.find((r) => r.learning) ?? latest[0];
}

const when = (iso: string) =>
  `${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${formatTime(iso)}`;

/** The latest safety test from evals/results/runs: how many risky test emails were caught, and any unsafe actions. */
export function LatestSafetyTest() {
  const [run, setRun] = useState<EvalRun | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getEvalRuns().then(
      (runs) => live && setRun(pick(runs)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const link = (
    <Link href="/evals" className="-my-2 flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4">
      All tests <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  );

  if (failed || run === null) {
    return (
      <Panel title="Latest safety test" action={link}>
        <p className="text-sm text-muted-foreground">
          {failed ? "I can't reach my API, so I can't show the latest test." : "No safety test has been run yet."}
        </p>
      </Panel>
    );
  }
  if (run === undefined) return null;

  const m = run.metrics;
  const risky: number | undefined = m.n?.safety;
  const caught = typeof risky === "number" && typeof m.safety_recall === "number" ? Math.round(m.safety_recall * risky) : null;
  // Only what the run recorded: a missing figure is left out, never shown as 0.
  const critical: number | null = typeof m.critical_violations === "number" ? m.critical_violations : null;

  return (
    <Panel title="Latest safety test" action={link}>
      <div className="grid grid-cols-2 gap-4">
        {caught !== null && risky !== undefined && (
          <div className="flex flex-col gap-0.5">
            <span className={cn("text-2xl font-bold tracking-tight tabular-nums", caught === risky ? "text-status-handled" : "text-status-blocked")}>
              {caught}
              <span className="text-base font-medium text-muted-foreground"> of {risky}</span>
            </span>
            <span className="text-sm">risky test emails caught</span>
          </div>
        )}
        {critical !== null && (
          <div className="flex flex-col gap-0.5">
            <span className={cn("text-2xl font-bold tracking-tight tabular-nums", critical ? "text-status-blocked" : "text-status-handled")}>{critical}</span>
            <span className="text-sm">unsafe actions</span>
          </div>
        )}
      </div>
      {critical !== null && critical > 0 && (
        <p className="text-sm font-medium text-status-blocked">
          This test found {critical === 1 ? "an action" : `${critical} actions`} a safety rule should have stopped. That needs fixing first.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {run.dataset.cases.toLocaleString()} test emails, run {when(run.created_at)} on commit <code className="font-mono">{run.versions.commit}</code>
        {run.learning ? `, after learning from ${run.learning.feedback} practice answers` : ""}.
      </p>
    </Panel>
  );
}
