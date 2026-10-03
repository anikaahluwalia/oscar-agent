import type { EvalRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { baselines, pct } from "./runs";

type Row = { label: string; get: (r: EvalRun) => string; bad?: (r: EvalRun) => boolean };

const ROWS: Row[] = [
  { label: "Right choice", get: (r) => pct(r.metrics.autonomy_accuracy, 0) },
  { label: "Asked when he didn't need to", get: (r) => pct(r.metrics.unnecessary_ask_rate, 0) },
  {
    label: "Risky emails acted on",
    get: (r) => String(r.metrics.critical_violations ?? 0),
    bad: (r) => (r.metrics.critical_violations ?? 0) > 0,
  },
];

/**
 * Rules only vs reading the email vs after learning, on the same held-out emails. Each column is the
 * newest saved run of its kind, and only the kinds that have a saved run get a column.
 */
export function DifferenceTable({ all, heldout }: { all: EvalRun[]; heldout: string }) {
  const { rules, model, learned } = baselines(all, heldout);
  const cols = [
    { key: "rules", label: "Rules only", run: rules },
    { key: "model", label: "Reading the email", run: model },
    { key: "learned", label: learned && !learned.versions.understanding ? "After learning (rules only)" : "After learning", run: learned },
  ].filter((c): c is typeof c & { run: EvalRun } => !!c.run);
  if (cols.length < 2) return null;
  const last = cols.at(-1)!.key;
  // Columns can come from different builds; say which only when they do.
  const mixed = new Set(cols.map((c) => c.run.versions.commit)).size > 1;

  return (
    <section aria-labelledby="difference" className="flex flex-col gap-1.5 rounded-[20px] border bg-card p-5 shadow-card">
      <h2 id="difference" className="text-[17px] font-bold">
        What made the difference
      </h2>
      <p className="text-[13px] text-muted-foreground">The same {cols[0].run.dataset.cases.toLocaleString()} test emails each time, from the newest saved run of each.</p>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-t px-1.5 py-3 sm:px-2.5 text-left">
                <span className="sr-only">Measure</span>
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="border-t px-1.5 py-3 sm:px-2.5 text-left font-semibold text-muted-foreground">
                  {c.label}
                  {mixed && <span className="block font-mono text-xs font-normal">{c.run.versions.commit}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-t px-1.5 py-3 sm:px-2.5 text-left font-normal">
                  {row.label}
                </th>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn("border-t px-1.5 py-3 sm:px-2.5 tabular-nums", c.key === last && "font-bold", row.bad?.(c.run) && "text-status-blocked")}
                  >
                    {row.get(c.run)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!model && (
        <p className="text-xs text-muted-foreground">
          No run with the model reading the emails yet. Run <code className="font-mono">python -m evals.measure --model fill</code> to add it.
        </p>
      )}
    </section>
  );
}
