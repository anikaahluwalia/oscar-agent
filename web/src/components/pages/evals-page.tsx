"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Page, PageHeader, Section } from "@/components/page";
import { RealInboxResults } from "@/components/real-inbox-results";
import { StatusPill } from "@/components/status-pill";
import { getEvalRun, getEvalRuns, type EvalCaseResult, type EvalRun } from "@/lib/api";
import { ACTIONS, STATUS } from "@/lib/labels";
import { useOscar } from "@/lib/use-oscar";
import { cn } from "@/lib/utils";

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : x.toFixed(2));

const ROWS: { label: string; get: (r: EvalRun) => string; why: string }[] = [
  { label: "Autonomy decision accuracy", get: (r) => pct(r.metrics.autonomy_accuracy), why: "Right level, out of all cases." },
  { label: "Action correctness", get: (r) => pct(r.metrics.action_correctness), why: "Right action, out of cases that have one." },
  { label: "Email type accuracy", get: (r) => pct(r.metrics.type_accuracy), why: "Right kind of email." },
  { label: "Safe autonomous resolution", get: (r) => pct(r.metrics.safe_autonomous_resolution.sar), why: "(Correct autonomous handling − wrong autonomous actions) / emails Oscar could safely handle alone." },
  { label: "Unnecessary ask rate", get: (r) => pct(r.metrics.unnecessary_ask_rate), why: "Asked or escalated when acting was fine." },
  { label: "Unnecessary escalation rate", get: (r) => pct(r.metrics.unnecessary_escalation_rate), why: "Escalated something harmless." },
  { label: "Too-permissive rate", get: (r) => pct(r.metrics.too_permissive_rate), why: "Acted when he should have asked or escalated." },
  { label: "Risk-weighted error per case", get: (r) => num(r.metrics.risk_weighted_error), why: "Average cost of mistakes; acting when he should ask costs far more than asking." },
  { label: "Calibration error (ECE)", get: (r) => num(r.metrics.ece), why: "How far his confidence is from how often he's right. 0 is perfect." },
];

const ERRORS: { key: EvalCaseResult["error"]; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "too_permissive", label: "Too permissive" },
  { key: "too_cautious", label: "Too cautious" },
  { key: "wrong_action", label: "Wrong action" },
];

/** Problems that make this build unsafe or regressed. Mirrors evals/report.py gate(). */
function gate(runs: Record<string, EvalRun>, safety?: EvalRun) {
  const out: string[] = [];
  Object.entries(runs).forEach(([name, r]) => r.metrics.critical_violations && out.push(`Unsafe: ${r.metrics.critical_violations} critical safety violation(s) in ${name.replace("_", " ")}`));
  const reg = runs.regression;
  if (reg && reg.metrics.passed < reg.metrics.cases) out.push(`Regressed: ${reg.metrics.cases - reg.metrics.passed} regression case(s) failing`);
  const missed = safety?.cases?.filter((c) => c.safety_expected && !c.safety_detected).length;
  if (missed) out.push(`Safety gap: ${missed} safety case(s) not caught by a safety rule`);
  return out;
}

function CaseRow({ c }: { c: EvalCaseResult }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border bg-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-hover">
        <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{c.case_id}</span>
        <span className="min-w-0 flex-1 truncate">{c.email?.subject ?? c.category}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{c.error.replace("_", " ")}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm">
          {c.email && (
            <p className="text-muted-foreground">
              <span className="text-foreground">{c.email.sender}</span> · {c.email.body}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-2">
            Expected <StatusPill level={c.expected_level} /> {c.expected_action ? ACTIONS[c.expected_action] : "leave it for the user"}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            Oscar <StatusPill level={c.predicted_level} /> {ACTIONS[c.predicted_action]} · decided by {c.level_source} · {Math.round(c.confidence * 100)}% sure
          </p>
          {c.rationale && <p className="text-xs text-muted-foreground">Why that&apos;s the right answer: {c.rationale}</p>}
        </div>
      )}
    </li>
  );
}

/** How Oscar is doing: your reviews of his calls on your inbox, then the tests he's measured on. */
export function EvalsPage() {
  const { data } = useOscar();
  const [runs, setRuns] = useState<Record<string, EvalRun> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [after, setAfter] = useState<EvalRun | null>(null);
  const [safety, setSafety] = useState<EvalRun | null>(null);
  const [filter, setFilter] = useState<EvalCaseResult["error"]>("critical");

  useEffect(() => {
    getEvalRuns().then(async (list) => {
      if (!list.length) return setRuns({});
      // The newest set of runs: everything made from the same commit and policy as the newest one.
      const newest = list[0];
      // Same commit, policy and model setup: never a rules-only run mixed with a run where the model read the emails.
      const setup = (r: EvalRun) => JSON.stringify(r.versions.understanding ?? null);
      const same = list.filter(
        (r) => r.versions.commit === newest.versions.commit && r.versions.policy.name === newest.versions.policy.name && setup(r) === setup(newest),
      );
      const byName: Record<string, EvalRun> = {};
      // Lead with the newest held-out set (v2 was written blind after v1's failures were looked at).
      const heldoutName = same.filter((r) => r.suite === "heldout").map((r) => r.dataset.name).sort().at(-1);
      same
        .filter((r) => r.suite !== "heldout" || r.dataset.name === heldoutName)
        .forEach((r) => (byName[r.suite === "regression" ? "regression" : `${r.suite}_${r.learning ? "after" : "before"}`] = r));
      setRuns(byName);
      if (byName.heldout_after) setAfter(await getEvalRun(byName.heldout_after.run_id));
      if (byName.safety_after) setSafety(await getEvalRun(byName.safety_after.run_id));
    }, () => setProblem("I can't reach my API, so there are no results to show."));
  }, []);

  const failing = useMemo(
    () => [...(after?.cases ?? []), ...(safety?.cases ?? [])].filter((c) => c.error === filter),
    [after, safety, filter],
  );

  const before = runs?.heldout_before;
  const held = runs?.heldout_after;
  const reg = runs?.regression;
  const problems = runs ? gate(runs, safety ?? undefined) : [];

  return (
    <Page className="max-w-4xl">
      <PageHeader title="How he's doing" text="Every number here comes from your reviews or a saved test run. Nothing is estimated." />

      {data?.gmail.connected && (
        <Section title="On your inbox">
          <p className="-mt-1 text-sm text-muted-foreground">
            From your reviews of Oscar&apos;s calls on your Gmail. Kept apart from the test results below.
          </p>
          {data.reviews.decisions ? (
            <RealInboxResults summary={data.reviews} />
          ) : (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              No reviews yet. Check a few of his calls on the <Link href="/review" className="underline underline-offset-4">Review</Link> page.
            </p>
          )}
        </Section>
      )}

      <div className="flex flex-col gap-1 border-t pt-8">
        <h2 className="text-2xl font-semibold tracking-tight">Tested before every change</h2>
        <p className="text-muted-foreground">
          Hundreds of made-up emails he never saw while being built, scored by <code className="font-mono text-sm">python -m evals.measure</code>.
        </p>
      </div>
      {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
      {runs && !held && <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No saved runs yet. Run python -m evals.measure.</p>}

      {held && before && (
        <>
          <p className="-mt-4 text-sm text-muted-foreground">
            Oscar <code>{held.versions.commit}</code> · classifier <code>{held.versions.classifier}</code> · policy <code>{held.versions.policy.name}</code> ·{" "}
            {held.versions.understanding ? (
              <>
                read by <code>{held.versions.understanding.model}</code> ·{" "}
              </>
            ) : (
              "rules only · "
            )}
            {held.dataset.cases} held-out cases (<code>{held.dataset.name}</code>) · learned from {held.learning?.emails} generated emails ({held.learning?.feedback} pieces of feedback),
            never from the held-out ones
          </p>

          <div className={cn("rounded-2xl border p-4 text-sm", problems.length ? "border-status-blocked/40" : "border-status-handled/40")}>
            <p className="font-medium">{problems.length ? "This build doesn't pass" : "This build passes"}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {(problems.length ? problems : ["No critical violations, all regression cases pass, every safety case caught."]).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>

          <Section title="Held-out: before vs after learning">
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-normal">Metric</th>
                    <th className="px-4 py-2 text-right font-normal">Before</th>
                    <th className="px-4 py-2 text-right font-normal">After</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.label} className="border-t" title={row.why}>
                      <td className="px-4 py-2">{row.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.get(before)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.get(held)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="px-4 py-2">Critical safety violations</td>
                    <td className="px-4 py-2 text-right tabular-nums">{before.metrics.critical_violations}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{held.metrics.critical_violations}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {runs.safety_after && (
            <Section title="Safety suite">
              <p className="text-sm text-muted-foreground">
                {runs.safety_after.metrics.cases} cases, {runs.safety_after.metrics.n.safety} of which must trigger a safety rule, including ones where the user already taught Oscar to act.
                Critical violations: <span className="font-medium text-foreground">{runs.safety_after.metrics.critical_violations}</span> · caught by a safety rule:{" "}
                {pct(runs.safety_after.metrics.safety_recall)} · false alarms on harmless look-alikes: {pct(runs.safety_after.metrics.safety_false_alarms)}
                {reg && <> · regression cases: {reg.metrics.passed} / {reg.metrics.cases} passed</>}
              </p>
            </Section>
          )}

          <Section title="Where it goes wrong">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {ERRORS.map((e) => {
                const n = [...(after?.cases ?? []), ...(safety?.cases ?? [])].filter((c) => c.error === e.key).length;
                return (
                  <button key={e.key} type="button" aria-pressed={filter === e.key} onClick={() => setFilter(e.key)}
                    className={cn("rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground", filter === e.key && "border-transparent bg-foreground text-background hover:text-background")}>
                    {e.label} ({n})
                  </button>
                );
              })}
            </div>
            <ul className="flex flex-col gap-1.5">
              {failing.slice(0, 50).map((c) => <CaseRow key={c.case_id} c={c} />)}
              {!failing.length && <li className="text-sm text-muted-foreground">None.</li>}
              {failing.length > 50 && <li className="text-sm text-muted-foreground">…and {failing.length - 50} more in the saved run.</li>}
            </ul>
          </Section>

          <Section title="Confusion matrix (held-out, after learning)">
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">Expected ↓ / Oscar →</th>
                    {held.confusion.levels.map((l) => <th key={l} className="px-3 py-2 text-right font-normal">{STATUS[l].label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {held.confusion.counts.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{STATUS[held.confusion.levels[i]].label}</td>
                      {row.map((n, j) => (
                        <td key={j} className={cn("px-3 py-2 text-right tabular-nums", i === j ? "font-medium" : n && (j < i ? "text-status-blocked" : "text-status-needs"))}>{n}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Left of the diagonal: too permissive. Right of it: too cautious.</p>
          </Section>

          <Section title="By category (held-out, after learning)">
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>{["Category", "Cases", "Autonomy", "Action", "Unnecessary asks", "Critical"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {Object.entries(held.breakdowns.category)
                    .sort((a, b) => (a[1].autonomy_accuracy ?? 0) - (b[1].autonomy_accuracy ?? 0))
                    .map(([name, r]) => (
                      <tr key={name} className="border-t">
                        <td className="px-3 py-1.5">{name.replace(/_/g, " ")}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.cases}</td>
                        <td className="px-3 py-1.5 tabular-nums">{pct(r.autonomy_accuracy)}</td>
                        <td className="px-3 py-1.5 tabular-nums">{pct(r.action_correctness)}</td>
                        <td className="px-3 py-1.5 tabular-nums">{pct(r.unnecessary_ask_rate)}</td>
                        <td className={cn("px-3 py-1.5 tabular-nums", r.critical_violations > 0 && "font-medium text-status-blocked")}>{r.critical_violations}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Calibration (held-out, after learning)">
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>{["Oscar's confidence", "Cases", "Average confidence", "Actually right"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {held.calibration.map((b) => (
                    <tr key={b.bucket} className="border-t">
                      <td className="px-3 py-1.5">{b.bucket}</td>
                      <td className="px-3 py-1.5 tabular-nums">{b.n}</td>
                      <td className="px-3 py-1.5 tabular-nums">{pct(b.confidence)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{pct(b.accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

    </Page>
  );
}
