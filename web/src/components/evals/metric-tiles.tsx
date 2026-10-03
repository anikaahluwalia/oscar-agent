import { CircleHelpIcon, ShieldAlertIcon, ShieldCheckIcon, TargetIcon, ZapIcon } from "lucide-react";
import { Stat } from "@/components/kit/stat";
import type { EvalCaseResult, EvalRun } from "@/lib/api";
import { injection, pct } from "./runs";

/** "x of y": what a rate is out of, from the run's own counts. */
const outOf = (rate: number | null | undefined, of: number | undefined) =>
  rate === null || rate === undefined || !of ? undefined : `${Math.round(rate * of)} of ${of}`;

/** The headline numbers, from the newest held-out run after learning (and the safety run for injections). */
export function MetricTiles({
  heldout,
  safety,
  safetyCases,
}: {
  heldout: EvalRun;
  safety?: EvalRun;
  /** undefined while loading, null if they couldn't be fetched. */
  safetyCases?: EvalCaseResult[] | null;
}) {
  const m = heldout.metrics;
  const critical: number = m.critical_violations ?? 0;
  const inj = injection(safetyCases);
  const recall: number | undefined = safety?.metrics.safety_recall;

  const tiles = [
    {
      key: "level",
      icon: <TargetIcon className="size-5" aria-hidden />,
      value: pct(m.autonomy_accuracy),
      label: "Right level",
      note: outOf(m.autonomy_accuracy, m.cases) ?? "Quietly, Tell me, Ask me or Stopped",
    },
    {
      key: "critical",
      icon: critical ? <ShieldAlertIcon className="size-5" aria-hidden /> : <ShieldCheckIcon className="size-5" aria-hidden />,
      tone: critical ? ("blocked" as const) : ("handled" as const),
      value: critical,
      label: "Risky emails acted on",
      note: safety ? `Should be 0. Safety test: ${safety.metrics.critical_violations ?? 0}` : "Should be 0",
    },
    {
      key: "ask",
      icon: <CircleHelpIcon className="size-5" aria-hidden />,
      value: pct(m.unnecessary_ask_rate),
      label: "Asked when he didn't need to",
      note: outOf(m.unnecessary_ask_rate, m.n?.delegable) ? `${outOf(m.unnecessary_ask_rate, m.n?.delegable)} he could have handled` : undefined,
    },
    {
      key: "permissive",
      icon: <ZapIcon className="size-5" aria-hidden />,
      value: pct(m.too_permissive_rate),
      label: "Acted when he should have waited",
      note: outOf(m.too_permissive_rate, m.n?.careful) ? `${outOf(m.too_permissive_rate, m.n?.careful)} that needed you` : undefined,
    },
    inj
      ? {
          key: "injection",
          icon: <ShieldCheckIcon className="size-5" aria-hidden />,
          tone: inj.caught === inj.of ? ("handled" as const) : ("blocked" as const),
          value: pct(inj.rate),
          label: "Injection attempts caught",
          note: `${inj.caught} of ${inj.of} in the safety test`,
        }
      : {
          key: "injection",
          icon: <ShieldCheckIcon className="size-5" aria-hidden />,
          value: safetyCases !== undefined || !safety ? pct(recall) : "...",
          label: safetyCases !== undefined || !safety ? "Risky emails caught" : "Injection attempts caught",
          note: !safety
            ? "No safety test saved"
            : safetyCases === undefined
              ? "Loading the safety test"
              : safetyCases === null
                ? "Couldn't load the safety test emails, so this is every risky one"
                : "No injection attempts in this run, so this is every risky email",
        },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map(({ key, ...t }) => (
        <li key={key} className="rounded-2xl border bg-card p-4 shadow-card last:col-span-2 lg:last:col-span-1">
          <Stat {...t} />
        </li>
      ))}
    </ul>
  );
}
