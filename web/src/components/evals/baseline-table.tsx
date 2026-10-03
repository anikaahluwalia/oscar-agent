import { Panel } from "@/components/kit/panel";
import type { EvalRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { baselines, interruptions, pct } from "./runs";

type Row = { label: string; get: (r: EvalRun) => string; bad?: (r: EvalRun) => boolean };

const ROWS: Row[] = [
  { label: "Right level", get: (r) => pct(r.metrics.autonomy_accuracy) },
  { label: "Right action", get: (r) => pct(r.metrics.action_correctness) },
  { label: "Risky emails acted on", get: (r) => String(r.metrics.critical_violations ?? 0), bad: (r) => (r.metrics.critical_violations ?? 0) > 0 },
  { label: "Asked when he didn't need to", get: (r) => pct(r.metrics.unnecessary_ask_rate) },
  { label: "Acted when he should have waited", get: (r) => pct(r.metrics.too_permissive_rate) },
  {
    label: "Interruptions per 10 emails",
    get: (r) => {
      const i = interruptions(r);
      return i ? i.per10.toFixed(1) : "n/a";
    },
  },
];

/** Rules only vs with the model vs after learning, on the same held-out emails. Each column is the newest saved run of its kind. */
export function BaselineTable({ all, heldout }: { all: EvalRun[]; heldout: string }) {
  const { rules, model, learned } = baselines(all, heldout);
  const cols: { key: string; label: string; run?: EvalRun }[] = [
    { key: "rules", label: "Rules only", run: rules },
    { key: "model", label: "With the model", run: model },
    { key: "learned", label: learned && !learned.versions.understanding ? "After learning (rules only)" : "After learning", run: learned },
  ];
  const commits = new Set(cols.map((c) => c.run?.versions.commit).filter(Boolean));

  return (
    <Panel title="Baseline comparison">
      <p className="-mt-2 text-sm text-muted-foreground">
        The same {cols.find((c) => c.run)?.run?.dataset.cases ?? ""} held-out emails (<code className="font-mono">{heldout}</code>), each column from the newest saved run of its kind.
      </p>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-normal">
                <span className="sr-only">Measure</span>
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="px-2 py-2 text-right align-bottom font-medium text-foreground">
                  {c.label}
                  {c.run && commits.size > 1 && <span className="block font-mono text-xs font-normal text-muted-foreground">{c.run.versions.commit}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {row.label}
                </th>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-2 py-2 text-right tabular-nums",
                      c.key === "learned" && "font-semibold",
                      c.run && row.bad?.(c.run) && "text-status-blocked",
                      !c.run && "text-muted-foreground",
                    )}
                  >
                    {c.run ? row.get(c.run) : "Not run"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {commits.size === 1 && (
        <p className="text-xs text-muted-foreground">
          All from commit <code className="font-mono">{[...commits][0]}</code>.
        </p>
      )}
      {!model && <p className="text-xs text-muted-foreground">No run with the model yet. Run <code className="font-mono">python -m evals.measure --model fill</code> to fill that column.</p>}
    </Panel>
  );
}
