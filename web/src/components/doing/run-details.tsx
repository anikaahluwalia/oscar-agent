"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Checklist } from "@/components/kit/checklist";
import { FilterChips } from "@/components/kit/chips";
import { Panel } from "@/components/kit/panel";
import { StatusWords } from "@/components/kit/status";
import type { EvalCaseResult, EvalRun } from "@/lib/api";
import { ACTIONS, LEVEL_SOURCES, STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { gate, num, pct, type RunSet } from "./runs";

const ROWS: { label: string; get: (r: EvalRun) => string; why: string }[] = [
  { label: "Right level", get: (r) => pct(r.metrics.autonomy_accuracy), why: "Quietly, Tell me, Ask me or Stopped: the one the email called for, out of all cases." },
  { label: "Right action", get: (r) => pct(r.metrics.action_correctness), why: "Out of cases that have an action." },
  { label: "Right kind of email", get: (r) => pct(r.metrics.type_accuracy), why: "Receipt, newsletter, and so on." },
  {
    label: "Handled safely on his own",
    get: (r) => pct(r.metrics.safe_autonomous_resolution?.sar),
    why: "(Right things done on his own − wrong things done on his own) / emails he could safely handle alone.",
  },
  { label: "Asked when he didn't need to", get: (r) => pct(r.metrics.unnecessary_ask_rate), why: "Asked or stopped when acting was fine." },
  { label: "Stopped something harmless", get: (r) => pct(r.metrics.unnecessary_escalation_rate), why: "Stopped an email that was safe." },
  { label: "Acted when he should have waited", get: (r) => pct(r.metrics.too_permissive_rate), why: "Acted when he should have asked or stopped." },
  { label: "Cost of mistakes per email", get: (r) => num(r.metrics.risk_weighted_error), why: "Acting when he should ask costs far more than asking." },
  { label: "Confidence gap (ECE)", get: (r) => num(r.metrics.ece), why: "How far his confidence is from how often he's right. 0 is perfect." },
];

type ErrorKind = Exclude<EvalCaseResult["error"], "none">;
const ERRORS: { key: ErrorKind; label: string }[] = [
  { key: "critical", label: "Acted on a risky email" },
  { key: "too_permissive", label: "Too bold" },
  { key: "too_cautious", label: "Too careful" },
  { key: "wrong_action", label: "Wrong action" },
];
type Show = ErrorKind | "all";
const SHOWS: { key: Show; label: string }[] = [...ERRORS, { key: "all", label: "Every test" }];
const SHOW_LABEL = Object.fromEntries(SHOWS.map((e) => [e.key, e.label])) as Record<Show, string>;

function CaseRow({ c }: { c: EvalCaseResult }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm hover:bg-surface-hover"
      >
        <span className="hidden w-32 shrink-0 font-mono text-xs text-muted-foreground sm:block">{c.case_id}</span>
        <span className="min-w-0 flex-1 truncate">{c.email?.subject ?? c.category.replace(/_/g, " ")}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{c.category.replace(/_/g, " ")}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm">
          <p className="font-mono text-xs text-muted-foreground sm:hidden">{c.case_id}</p>
          {c.email && (
            <p className="text-muted-foreground">
              <span className="text-foreground">{c.email.sender}</span> · {c.email.body}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-muted-foreground">Right</span>
            <StatusWords level={c.expected_level}>{STATUS[c.expected_level].label}</StatusWords> {c.expected_action ? ACTIONS[c.expected_action] : "Leave it for you"}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-muted-foreground">Oscar</span>
            <StatusWords level={c.predicted_level}>{STATUS[c.predicted_level].label}</StatusWords> {ACTIONS[c.predicted_action]} · {Math.round(c.confidence * 100)}% sure
          </p>
          <p className="text-xs text-muted-foreground">
            His reason: &ldquo;{LEVEL_SOURCES[c.level_source as keyof typeof LEVEL_SOURCES] ?? c.level_source}&rdquo;
          </p>
          {c.rationale && <p className="text-xs text-muted-foreground">Why that&apos;s the right answer: {c.rationale}</p>}
        </div>
      )}
    </li>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("px-3 py-2 font-normal first:pl-0", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = "px-3 py-2 text-right tabular-nums";

/** Everything else from the run set: the pass/fail gate, every test with the ones he got wrong, and the tables behind the headline numbers. */
export function RunDetails({
  set,
  heldoutCases,
  safetyCases,
}: {
  set: RunSet;
  /** undefined while loading, null if they couldn't be fetched. */
  heldoutCases?: EvalCaseResult[] | null;
  safetyCases?: EvalCaseResult[] | null;
}) {
  const held = set.heldoutAfter!;
  const before = set.heldoutBefore;
  const safety = set.safetyAfter;
  const reg = set.regression;
  const problems = gate(set, safetyCases);
  const [picked, setFilter] = useState<Show | null>(null);

  const all = useMemo(() => [...(heldoutCases ?? []), ...(safetyCases ?? [])], [heldoutCases, safetyCases]);
  // Until you pick one, open on the most serious kind of mistake that actually happened.
  const filter = picked ?? ERRORS.find((e) => all.some((c) => c.error === e.key))?.key ?? "critical";
  const shown = filter === "all" ? all : all.filter((c) => c.error === filter);
  const loaded = heldoutCases !== undefined;
  const failed = heldoutCases === null || safetyCases === null;

  return (
    <div className="flex flex-col gap-6">
      <Panel title={problems.length ? "This build doesn't pass" : "This build passes"} className={problems.length ? "border-status-blocked/40" : undefined}>
        <Checklist
          items={
            problems.length
              ? problems.map((p) => ({ label: p, ok: false }))
              : [
                  { label: "No risky email acted on, in any test", ok: true },
                  ...(reg ? [{ label: `All ${reg.metrics.cases} regression cases pass`, ok: true }] : []),
                  ...(safetyCases?.length ? [{ label: "Every risky test email caught by a safety check", ok: true }] : []),
                ]
          }
        />
        {safety && (
          <p className="text-sm text-muted-foreground">
            Safety test: {safety.metrics.cases} emails, {safety.metrics.n?.safety} of them risky, some where the pretend user had already taught Oscar to act. Caught by a
            safety check: {pct(safety.metrics.safety_recall)}. False alarms on harmless look-alikes: {pct(safety.metrics.safety_false_alarms)}.
            {reg && ` Regression cases: ${reg.metrics.passed} of ${reg.metrics.cases} pass.`}
          </p>
        )}
      </Panel>

      <Panel title="Every test, and the ones he got wrong">
        <p className="-mt-2 text-sm text-muted-foreground">Held-out and safety test emails after learning. Open one to see the email, what he did, and the right answer.</p>
        <FilterChips
          label="Show"
          value={filter}
          onChange={setFilter}
          options={SHOWS.map((e) => ({
            key: e.key,
            label: e.label,
            count: loaded ? (e.key === "all" ? all.length : all.filter((c) => c.error === e.key).length) : undefined,
          }))}
        />
        {failed && <p className="text-sm text-muted-foreground">I couldn&apos;t load some of the test emails, so this list may be missing some.</p>}
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading the test emails...</p>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label={SHOW_LABEL[filter]}>
            {shown.slice(0, 50).map((c) => (
              <CaseRow key={c.case_id} c={c} />
            ))}
            {!shown.length && <li className="text-sm text-muted-foreground">None.</li>}
            {shown.length > 50 && <li className="text-sm text-muted-foreground">...and {shown.length - 50} more in the saved run.</li>}
          </ul>
        )}
      </Panel>

      {before && (
        <Panel title="Held-out, before and after learning">
          <Table head={["Measure", "Before", "After"]}>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {row.label}
                  <span className="block text-xs text-muted-foreground">{row.why}</span>
                </th>
                <td className={td}>{row.get(before)}</td>
                <td className={cn(td, "font-semibold")}>{row.get(held)}</td>
              </tr>
            ))}
            <tr className="border-t">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                Risky emails acted on
              </th>
              <td className={cn(td, before.metrics.critical_violations > 0 && "text-status-blocked")}>{before.metrics.critical_violations}</td>
              <td className={cn(td, "font-semibold", held.metrics.critical_violations > 0 && "text-status-blocked")}>{held.metrics.critical_violations}</td>
            </tr>
          </Table>
        </Panel>
      )}


      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Panel title="What he did vs what was right">
          <p className="-mt-2 text-sm text-muted-foreground">Held-out, after learning. Rows are the right answer, columns are what Oscar did.</p>
          <Table head={["Right ↓ / Oscar →", ...held.confusion.levels.map((l) => STATUS[l].label)]}>
            {held.confusion.counts.map((row, i) => (
              <tr key={held.confusion.levels[i]} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {STATUS[held.confusion.levels[i]].label}
                </th>
                {row.map((n, j) => (
                  <td key={j} className={cn(td, i === j ? "font-semibold" : n > 0 && (j < i ? "text-status-blocked" : "text-status-needs"))}>
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          <p className="text-xs text-muted-foreground">Left of the diagonal: too bold. Right of it: too careful.</p>
        </Panel>

        <Panel title="How sure he was vs how often he was right">
          <p className="-mt-2 text-sm text-muted-foreground">Held-out, after learning.</p>
          <Table head={["How sure he was", "Emails", "On average", "Actually right"]}>
            {held.calibration.map((b) => (
              <tr key={b.bucket} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {b.bucket}
                </th>
                <td className={td}>{b.n}</td>
                <td className={td}>{pct(b.confidence)}</td>
                <td className={td}>{pct(b.accuracy)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title="By kind of email">
        <p className="-mt-2 text-sm text-muted-foreground">Held-out, after learning. Weakest first.</p>
        <Table head={["Kind", "Emails", "Right level", "Right action", "Asked needlessly", "Risky acted on"]}>
          {Object.entries(held.breakdowns.category ?? {})
            .sort((a, b) => (a[1].autonomy_accuracy ?? 0) - (b[1].autonomy_accuracy ?? 0))
            .map(([name, r]) => (
              <tr key={name} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
                  {name.replace(/_/g, " ")}
                </th>
                <td className={td}>{r.cases}</td>
                <td className={td}>{pct(r.autonomy_accuracy)}</td>
                <td className={td}>{pct(r.action_correctness)}</td>
                <td className={td}>{pct(r.unnecessary_ask_rate)}</td>
                <td className={cn(td, r.critical_violations > 0 && "font-semibold text-status-blocked")}>{r.critical_violations}</td>
              </tr>
            ))}
        </Table>
      </Panel>
    </div>
  );
}
